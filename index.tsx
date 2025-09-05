

// FIX: The original file content was invalid. It has been replaced with the full, functional
// TPA STMIK Komputama Majenang application code, restoring all features.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// As per guidelines, API key is obtained from process.env.API_KEY.
// This is assumed to be configured in the build environment.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

// --- MOCK DATABASE using localStorage ---
const getFromStorage = (key, defaultValue) => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error(`Error reading from localStorage key “${key}”:`, error);
        return defaultValue;
    }
};

const saveToStorage = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error(`Error writing to localStorage key “${key}”:`, error);
    }
};


const App = () => {
    // --- STATE MANAGEMENT ---
    const [appState, setAppState] = useState('login'); // login, admin_dashboard, student_dashboard, etc.
    const [currentUser, setCurrentUser] = useState(null);
    const [users, setUsers] = useState(() => getFromStorage('tpa_users', [{ username: 'admin', password: 'admin123', role: 'admin' }]));
    const [results, setResults] = useState(() => getFromStorage('tpa_results', []));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Quiz State
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState([]);
    const [timer, setTimer] = useState(30);

    // Admin State
    const [viewingResult, setViewingResult] = useState(null);
    const [categories, setCategories] = useState(() => getFromStorage('tpa_categories', [
        { id: 1, name: 'Logika Verbal' },
        { id: 2, name: 'Matematika Dasar' },
        { id: 3, name: 'Penalaran Analitis' },
    ]));
    const [backgroundUrl, setBackgroundUrl] = useState(() => getFromStorage('tpa_background', ''));
    const [testConfig, setTestConfig] = useState([]);
    
    // --- EFFECTS ---
    useEffect(() => {
        saveToStorage('tpa_users', users);
    }, [users]);
    
    useEffect(() => {
        saveToStorage('tpa_results', results);
    }, [results]);

    useEffect(() => {
        saveToStorage('tpa_categories', categories);
    }, [categories]);

    useEffect(() => {
        saveToStorage('tpa_background', backgroundUrl);
        if (backgroundUrl) {
            document.body.style.backgroundImage = `url(${backgroundUrl})`;
            document.body.classList.add('has-custom-background');
        } else {
            document.body.style.backgroundImage = 'none';
            document.body.classList.remove('has-custom-background');
        }
    }, [backgroundUrl]);

    // Timer Effect
    useEffect(() => {
        if (appState.startsWith('quiz_')) {
            if (timer > 0) {
                const interval = setInterval(() => {
                    setTimer(t => t - 1);
                }, 1000);
                return () => clearInterval(interval);
            } else {
                handleNextQuestion();
            }
        }
    }, [timer, appState]);


    // --- HANDLERS ---
    const handleLogin = (username, password) => {
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            setCurrentUser(user);
            setError('');
            if (user.role === 'admin') {
                setAppState('admin_dashboard');
            } else if (!user.fullName || !user.studyProgram || !user.regNumber) {
                setAppState('student_profile_completion');
            } else {
                setAppState('student_dashboard');
            }
        } else {
            setError('Username atau password salah.');
        }
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setAppState('login');
    };
    
    const handleProfileUpdate = (profileData) => {
        const updatedUser = { ...currentUser, ...profileData };
        setCurrentUser(updatedUser);
        setUsers(users.map(u => u.username === updatedUser.username ? updatedUser : u));
        setAppState('student_dashboard');
    };

    const handleAddUser = (username, password) => {
        if (users.some(u => u.username === username)) {
            setError('Username sudah ada.');
            return;
        }
        setUsers([...users, { username, password, role: 'student' }]);
        setError('');
    };

    const generateQuestions = async (testConfig) => {
        setLoading(true);
        setError('');
        try {
            const prompt = `Buatlah soal-soal untuk Tes Potensi Akademik (TPA) seleksi masuk STMIK Komputama Majenang dengan konfigurasi berikut.
            Pastikan jawaban yang benar ditandai dengan benar di 'correctAnswerIndex'.
            
            Konfigurasi:
            ${testConfig.map(config => `- Kategori: "${config.category}", Jumlah Soal: ${config.count}, Tipe Soal: ${config.type}`).join('\n')}
            
            Format output harus berupa JSON array. Setiap elemen dalam array adalah sebuah objek yang merepresentasikan satu kategori, dengan properti 'category' dan 'questions'.
            Properti 'questions' harus berupa array objek soal.
            Untuk soal 'Pilihan Ganda', setiap objek soal harus memiliki properti 'question' (string), 'options' (array of strings), dan 'correctAnswerIndex' (number, 0-based).
            Untuk soal 'Esai', setiap objek soal harus memiliki properti 'question' (string) dan 'type' dengan nilai 'essay'.
            `;
            
            const responseSchema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        category: { type: Type.STRING },
                        questions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    question: { type: Type.STRING },
                                    options: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
                                    correctAnswerIndex: { type: Type.NUMBER, nullable: true },
                                    type: { type: Type.STRING, nullable: true },
                                }
                            }
                        }
                    }
                }
            };

            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { responseMimeType: 'application/json', responseSchema }
            });
            
            const generatedData = JSON.parse(result.text);
            const flatQuestions = generatedData.flatMap(section => 
                section.questions.map(q => ({ ...q, category: section.category }))
            );
            
            setQuestions(flatQuestions);
            setAppState('admin_question_review');
        } catch (e) {
            console.error(e);
            setError('Gagal membuat soal. Silakan coba lagi.');
            setAppState('admin_question_management');
        } finally {
            setLoading(false);
        }
    };

    const startTest = () => {
        setUserAnswers([]);
        setCurrentQuestionIndex(0);
        setTimer(30);
        setAppState('quiz_section');
    };

    const handleNextQuestion = () => {
        const nextIndex = currentQuestionIndex + 1;
        if (nextIndex < questions.length) {
            setCurrentQuestionIndex(nextIndex);
            setTimer(30);
        } else {
            // Test finished
            const scoreMC = userAnswers.reduce((acc, ans) => {
                const question = questions[ans.questionIndex];
                // FIX: Check for options array instead of type string for reliability
                if (question.options && Array.isArray(question.options) && ans.answer === question.correctAnswerIndex) {
                    return acc + 1;
                }
                return acc;
            }, 0);
            
            const totalMC = questions.filter(q => q.options && Array.isArray(q.options)).length;

            const newResult = {
                username: currentUser.username,
                date: new Date().toISOString(),
                scoreMC,
                totalMC,
                answers: userAnswers,
                questions: questions, // Save a snapshot of the questions
            };
            setResults([...results, newResult]);
            setAppState('student_results');
        }
    };

    const handleAnswer = (answer) => {
        setUserAnswers([...userAnswers.filter(a => a.questionIndex !== currentQuestionIndex), {
            questionIndex: currentQuestionIndex,
            answer
        }]);
    };
    
    const handleAddCategory = (name) => {
        if (name && !categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            const newCategory = { id: Date.now(), name };
            setCategories([...categories, newCategory]);
        }
    };

    const handleEditCategory = (id, newName) => {
        if (newName) {
            setCategories(categories.map(c => (c.id === id ? { ...c, name: newName } : c)));
        }
    };

    const handleDeleteCategory = (id) => {
        setCategories(categories.filter(c => c.id !== id));
    };


    // --- RENDER FUNCTIONS ---
    const renderLogin = () => (
        <div className="card auth-card">
            <h1>TPA STMIK Komputama Majenang</h1>
            <p>Silakan masuk untuk melanjutkan</p>
            {/* FIX: Type the form event to correctly access form elements. */}
            <form onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const username = (e.currentTarget.elements.namedItem('username') as HTMLInputElement).value;
                const password = (e.currentTarget.elements.namedItem('password') as HTMLInputElement).value;
                handleLogin(username, password);
            }}>
                <div className="form-group">
                    <label htmlFor="username">Username</label>
                    <input type="text" id="username" name="username" required />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input type="password" id="password" name="password" required />
                </div>
                {error && <p className="error-message">{error}</p>}
                <button type="submit" className="button-primary">Masuk</button>
            </form>
        </div>
    );

    const renderStudentProfileCompletion = () => (
        <div className="card">
            <h2>Lengkapi Profil Anda</h2>
            {/* FIX: Type the form event to correctly access form elements. */}
            <form onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                handleProfileUpdate({
                    fullName: (e.currentTarget.elements.namedItem('fullName') as HTMLInputElement).value,
                    studyProgram: (e.currentTarget.elements.namedItem('studyProgram') as HTMLSelectElement).value,
                    regNumber: (e.currentTarget.elements.namedItem('regNumber') as HTMLInputElement).value,
                });
            }}>
                <div className="form-group">
                    <label htmlFor="fullName">Nama Lengkap</label>
                    <input type="text" id="fullName" name="fullName" required />
                </div>
                <div className="form-group">
                    <label htmlFor="studyProgram">Program Studi</label>
                    <select id="studyProgram" name="studyProgram" required>
                        <option value="Sistem Informasi">Sistem Informasi</option>
                        <option value="Teknik Informatika">Teknik Informatika</option>
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="regNumber">No. Pendaftaran</label>
                    <input type="text" id="regNumber" name="regNumber" required />
                </div>
                <button type="submit" className="button-primary">Simpan Profil</button>
            </form>
        </div>
    );
    
    const renderStudentDashboard = () => (
        <div className="card">
            <button className="button-logout" onClick={handleLogout}>Logout</button>
            <h2>Selamat Datang, {currentUser.fullName}!</h2>
            <div className="profile-info">
                <p><strong>Nama:</strong> {currentUser.fullName}</p>
                <p><strong>Prodi:</strong> {currentUser.studyProgram}</p>
                <p><strong>No. Pendaftaran:</strong> {currentUser.regNumber}</p>
            </div>
            <p>Anda siap untuk memulai Tes Potensi Akademik.</p>
            <button className="button-primary" onClick={startTest} disabled={loading}>
                {loading ? 'Memuat Soal...' : 'Mulai TPA STMIK Komputama Majenang'}
            </button>
        </div>
    );

    const renderAdminDashboard = () => (
        <div className="card">
             <button className="button-logout" onClick={handleLogout}>Logout</button>
            <h2>Dashboard Admin</h2>
            <div className="dashboard-grid">
                <div className="action-card" onClick={() => setAppState('admin_results_recap')}>
                    <h3>Rekap Hasil Siswa</h3>
                    <p>Lihat dan kelola hasil tes semua siswa.</p>
                </div>
                 <div className="action-card" onClick={() => setAppState('admin_category_management')}>
                    <h3>Manajemen Kategori Soal</h3>
                    <p>Tambah, edit, atau hapus kategori soal.</p>
                </div>
                <div className="action-card" onClick={() => {
                    setTestConfig([]);
                    setAppState('admin_question_management');
                }}>
                    <h3>Manajemen Soal Ujian</h3>
                    <p>Buat set soal baru untuk ujian.</p>
                </div>
                <div className="action-card" onClick={() => setAppState('admin_user_management')}>
                    <h3>Manajemen Pengguna</h3>
                    <p>Tambah atau kelola akun siswa.</p>
                </div>
                <div className="action-card" onClick={() => setAppState('admin_background_management')}>
                    <h3>Ubah Latar Belakang</h3>
                    <p>Ganti gambar latar belakang website.</p>
                </div>
            </div>
        </div>
    );

    const renderAdminUserManagement = () => (
        <div className="card">
            <button className="button-back" onClick={() => setAppState('admin_dashboard')}>&larr; Kembali</button>
            <h2>Manajemen Pengguna</h2>
            <div className="user-management-content">
                <div className="user-list">
                    <h3>Daftar Siswa</h3>
                    <ul>
                        {users.filter(u => u.role === 'student').map(u => <li key={u.username}>{u.username}</li>)}
                    </ul>
                </div>
                <div className="add-user-form">
                    <h3>Tambah Siswa Baru</h3>
                    {/* FIX: Type the form event to correctly access form elements and the reset method. */}
                    <form onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
                        e.preventDefault();
                        const username = (e.currentTarget.elements.namedItem('newUsername') as HTMLInputElement).value;
                        const password = (e.currentTarget.elements.namedItem('newPassword') as HTMLInputElement).value;
                        handleAddUser(username, password);
                        e.currentTarget.reset();
                    }}>
                        <div className="form-group">
                            <label htmlFor="newUsername">Username</label>
                            <input type="text" id="newUsername" name="newUsername" required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="newPassword">Password</label>
                            <input type="password" id="newPassword" name="newPassword" required />
                        </div>
                        {error && <p className="error-message">{error}</p>}
                        <button type="submit" className="button-primary">Tambah</button>
                    </form>
                </div>
            </div>
        </div>
    );
    
    const renderAdminCategoryManagement = () => (
        <div className="card">
            <button className="button-back" onClick={() => setAppState('admin_dashboard')}>&larr; Kembali</button>
            <h2>Manajemen Kategori Soal</h2>
            <div className="user-management-content">
                 <div className="user-list">
                    <h3>Daftar Kategori</h3>
                    <ul>
                        {categories.map(cat => (
                            <li key={cat.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                {cat.name}
                                <div>
                                    <button className="button-link" onClick={() => {
                                        const newName = prompt('Masukkan nama kategori baru:', cat.name);
                                        handleEditCategory(cat.id, newName);
                                    }}>Edit</button>
                                    <button className="button-link" style={{color: 'var(--error-color)'}} onClick={() => {
                                        if (confirm(`Yakin ingin menghapus kategori "${cat.name}"?`)) {
                                            handleDeleteCategory(cat.id);
                                        }
                                    }}>Hapus</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="add-user-form">
                    <h3>Tambah Kategori Baru</h3>
                    {/* FIX: Type the form event to correctly access form elements and the reset method. */}
                    <form onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
                        e.preventDefault();
                        const name = (e.currentTarget.elements.namedItem('newCategoryName') as HTMLInputElement).value;
                        handleAddCategory(name);
                        e.currentTarget.reset();
                    }}>
                        <div className="form-group">
                            <label htmlFor="newCategoryName">Nama Kategori</label>
                            <input type="text" id="newCategoryName" name="newCategoryName" required />
                        </div>
                        <button type="submit" className="button-primary">Tambah</button>
                    </form>
                </div>
            </div>
        </div>
    );


    const renderAdminQuestionManagement = () => {
        const addConfig = () => {
             setTestConfig([...testConfig, { category: categories[0]?.name || '', count: 10, type: 'Pilihan Ganda' }]);
        };

        // FIX: Replaced state-mutating logic with immutable updates to ensure React re-renders correctly.
        const updateConfig = (index, field, value) => {
            const newConfig = testConfig.map((item, i) => {
                if (i === index) {
                    return { ...item, [field]: value };
                }
                return item;
            });
            setTestConfig(newConfig);
        };
        
        // FIX: Switched to using .filter() for a more idiomatic immutable removal.
        const removeConfig = (index) => {
            setTestConfig(testConfig.filter((_, i) => i !== index));
        };

        return (
            <div className="card">
                <button className="button-back" onClick={() => setAppState('admin_dashboard')}>&larr; Kembali</button>
                <h2>Konfigurasi Soal Ujian</h2>
                <form onSubmit={(e) => { e.preventDefault(); generateQuestions(testConfig); }}>
                    {testConfig.map((config, index) => (
                        <div key={index} style={{display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '1rem'}}>
                            <div className="form-group" style={{flex: 3}}>
                                <label>Kategori</label>
                                <select value={config.category} onChange={e => updateConfig(index, 'category', e.target.value)}>
                                    {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{flex: 1}}>
                                <label>Jumlah</label>
                                <input type="number" min="1" max="50" value={config.count} onChange={e => updateConfig(index, 'count', parseInt(e.target.value, 10) || 1)} />
                            </div>
                            <div className="form-group" style={{flex: 2}}>
                                <label>Tipe Soal</label>
                                <select value={config.type} onChange={e => updateConfig(index, 'type', e.target.value)}>
                                    <option>Pilihan Ganda</option>
                                    <option>Esai</option>
                                </select>
                            </div>
                            <button type="button" onClick={() => removeConfig(index)} style={{height: '40px', marginTop:'1rem'}} className="button-secondary">&times;</button>
                        </div>
                    ))}
                    <button type="button" className="button-secondary" onClick={addConfig} style={{marginBottom: '1rem'}}>+ Tambah Bagian Soal</button>
                    <button type="submit" className="button-primary" disabled={testConfig.length === 0}>
                        Buat Soal
                    </button>
                </form>
                {error && <p className="error-message">{error}</p>}
            </div>
        );
    };

    const renderAdminQuestionReview = () => (
        <div className="card">
            <h2>Tinjau Soal Ujian</h2>
            <div className="question-review-container">
                {questions.reduce((acc, question) => {
                    if (!acc.find(s => s.category === question.category)) {
                        acc.push({ category: question.category, questions: [] });
                    }
                    acc.find(s => s.category === question.category).questions.push(question);
                    return acc;
                }, []).map((section, sectionIndex) => (
                    <div key={sectionIndex} className="section-review">
                        <h3>{section.category}</h3>
                        {section.questions.map((q, qIndex) => (
                            <div key={qIndex} className="question-item">
                                <p><strong>Soal {qIndex + 1}:</strong> {q.question}</p>
                                {q.options && Array.isArray(q.options) && (
                                    <ul>
                                        {q.options.map((opt, optIndex) => (
                                            <li key={optIndex} className={optIndex === q.correctAnswerIndex ? 'correct' : ''}>
                                                {String.fromCharCode(65 + optIndex)}. {opt}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            <div className="button-group">
                <button className="button-secondary" onClick={() => setAppState('admin_question_management')}>Buat Ulang</button>
                <button className="button-primary" onClick={startTest}>Setujui & Mulai Tes (untuk Siswa)</button>
            </div>
        </div>
    );
    
    const renderQuiz = () => {
        if (!questions || questions.length === 0) {
            return (
                <div className="card">
                    <h2>Tes Tidak Tersedia</h2>
                    <p>Admin belum menyiapkan soal untuk tes ini.</p>
                    <button className="button-primary" onClick={() => setAppState(currentUser.role === 'admin' ? 'admin_dashboard' : 'student_dashboard')}>
                        Kembali ke Dashboard
                    </button>
                </div>
            );
        }

        const currentQuestion = questions[currentQuestionIndex];
        const currentAnswer = userAnswers.find(a => a.questionIndex === currentQuestionIndex)?.answer;
        const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
        
        return (
            <div className="card quiz-card">
                <div className="quiz-header">
                    <span>Soal {currentQuestionIndex + 1} dari {questions.length}</span>
                    <span className="timer">Sisa Waktu: {timer}s</span>
                </div>
                <div className="progress-bar"><div style={{ width: `${progress}%` }}></div></div>
                <h3 className="section-title">{currentQuestion.category}</h3>
                <p className="question-text">{currentQuestion.question}</p>

                {/* FIX: Check for options array instead of type string for reliability */}
                {currentQuestion.options && Array.isArray(currentQuestion.options) ? (
                    <div className="options-container">
                        {currentQuestion.options.map((option, index) => (
                            <button
                                key={index}
                                className={`option-button ${currentAnswer === index ? 'selected' : ''}`}
                                onClick={() => handleAnswer(index)}
                            >
                                {String.fromCharCode(65 + index)}. {option}
                            </button>
                        ))}
                    </div>
                ) : (
                     <textarea
                        className="form-group essay-input"
                        placeholder="Ketik jawaban esai Anda di sini..."
                        value={currentAnswer || ''}
                        onChange={(e) => handleAnswer(e.target.value)}
                    />
                )}

                <button className="button-primary" onClick={handleNextQuestion}>
                    {currentQuestionIndex === questions.length - 1 ? 'Selesaikan Tes' : 'Soal Berikutnya'}
                </button>
            </div>
        );
    };

    const renderStudentResults = () => {
        const lastResult = results.filter(r => r.username === currentUser.username).pop();

        if (!lastResult) {
            return <div className="card"><p>Hasil tidak ditemukan.</p></div>;
        }

        // FIX: When `reduce` is called on an untyped array (`any[]`), TypeScript cannot always infer the accumulator's
        // type, resulting in `any`. `Object.entries` on an `any` object produces `unknown` values, causing type errors.
        // Explicitly typing the accumulator (`acc`) in the callback resolves this.
        const sections = lastResult.questions.reduce((acc: Record<string, { correct: number, total: number }>, q: any) => {
             if (!acc[q.category]) {
                acc[q.category] = { correct: 0, total: 0 };
            }
             // FIX: Check for options array instead of type string for reliability
            if (q.options && Array.isArray(q.options)) {
                acc[q.category].total++;
                const userAnswer = lastResult.answers.find(a => a.questionIndex === lastResult.questions.indexOf(q));
                if (userAnswer && userAnswer.answer === q.correctAnswerIndex) {
                    acc[q.category].correct++;
                }
            }
            return acc;
        }, {} as Record<string, { correct: number, total: number }>);


        return (
            <div className="card">
                <h2>Hasil Tes Anda</h2>
                <div className="results-summary">
                     <h4>Skor Pilihan Ganda: {lastResult.scoreMC} / {lastResult.totalMC}</h4>
                    {/* FIX: Cast the result of Object.entries to provide a concrete type for `data`.
                        This is necessary because `sections` is inferred as `any` due to being created
                        from data loaded from localStorage, causing `Object.entries` to return values of type `unknown`. */}
                    {(Object.entries(sections) as [string, { correct: number; total: number }][]).filter(([,data]) => data.total > 0).map(([category, data]) => (
                        <div key={category} className="result-section-item">
                            <strong>{category}:</strong> {data.correct} dari {data.total} benar
                        </div>
                    ))}
                </div>
                <p>Jawaban esai dan wawancara Anda telah dikirim untuk dinilai.</p>
                <button className="button-primary" onClick={() => setAppState('student_dashboard')}>Kembali ke Dashboard</button>
            </div>
        );
    };

    const renderAdminResultsRecap = () => (
        <div className="card">
            <button className="button-back" onClick={() => setAppState('admin_dashboard')}>&larr; Kembali</button>
            <h2>Rekap Hasil Siswa</h2>
            <ul className="results-list">
                {results.length > 0 ? results.map((result, index) => {
                    const student = users.find(u => u.username === result.username);
                    return (
                         <li key={index} onClick={() => { setViewingResult(result); setAppState('admin_result_detail'); }}>
                            <span>
                                <strong>{student?.fullName || result.username}</strong> ({new Date(result.date).toLocaleString()})
                            </span>
                            <span>Skor: {result.scoreMC}/{result.totalMC}</span>
                        </li>
                    )
                }) : <p>Belum ada hasil tes yang masuk.</p>}
            </ul>
        </div>
    );
    
    const renderAdminResultDetail = () => {
        if (!viewingResult) return null;
        if (!viewingResult.questions) {
             return (
                 <div className="card">
                    <button className="button-back" onClick={() => setAppState('admin_results_recap')}>&larr; Kembali</button>
                    <h2>Detail Hasil</h2>
                    <p className="error-message">Data soal untuk hasil tes ini tidak ditemukan. Ini mungkin hasil dari versi aplikasi yang lebih lama.</p>
                </div>
            )
        }
        
        const student = users.find(u => u.username === viewingResult.username);
        return (
            <div className="card">
                <button className="button-back" onClick={() => setAppState('admin_results_recap')}>&larr; Kembali</button>
                <h2>Detail Hasil untuk {student?.fullName || viewingResult.username}</h2>
                <div className="profile-info">
                    <p><strong>Nama:</strong> {student?.fullName}</p>
                    <p><strong>Prodi:</strong> {student?.studyProgram}</p>
                    <p><strong>No. Pendaftaran:</strong> {student?.regNumber}</p>
                    <p><strong>Waktu Tes:</strong> {new Date(viewingResult.date).toLocaleString()}</p>
                    <p><strong>Skor Pilihan Ganda:</strong> {viewingResult.scoreMC}/{viewingResult.totalMC}</p>
                </div>
                <div className="question-review-container">
                    {viewingResult.questions.map((q, index) => {
                        const userAnswerObj = viewingResult.answers.find(a => a.questionIndex === index);
                        return (
                            <div key={index} className="question-item">
                                <p><strong>{index + 1}. ({q.category})</strong> {q.question}</p>
                                {/* FIX: Check for options array instead of type string for reliability */}
                                {q.options && Array.isArray(q.options) ? (
                                    <ul>
                                        {q.options.map((opt, optIndex) => {
                                            const isCorrect = optIndex === q.correctAnswerIndex;
                                            const isSelected = userAnswerObj?.answer === optIndex;
                                            let className = '';
                                            if (isCorrect && isSelected) className = 'correct-selected';
                                            else if (isCorrect) className = 'correct';
                                            else if (isSelected) className = 'incorrect';

                                            return <li key={optIndex} className={className}>{String.fromCharCode(65 + optIndex)}. {opt}</li>;
                                        })}
                                    </ul>
                                ) : (
                                    <div className="answer-user">
                                        <p><strong>Jawaban Siswa:</strong></p>
                                        <p>{userAnswerObj?.answer || '(Tidak dijawab)'}</p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };
    
    const renderAdminBackgroundManagement = () => (
         <div className="card">
            <button className="button-back" onClick={() => setAppState('admin_dashboard')}>&larr; Kembali</button>
            <h2>Ubah Latar Belakang Website</h2>
            {/* FIX: Type the form event to correctly access form elements. */}
            <form onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                setBackgroundUrl((e.currentTarget.elements.namedItem('bgUrl') as HTMLInputElement).value);
            }}>
                <div className="form-group">
                    <label htmlFor="bgUrl">URL Gambar Latar Belakang</label>
                    <input type="url" id="bgUrl" name="bgUrl" placeholder="https://example.com/image.jpg" defaultValue={backgroundUrl} />
                </div>
                <div className="button-group" style={{ justifyContent: 'flex-start' }}>
                    <button type="submit" className="button-primary">Simpan</button>
                    <button type="button" className="button-secondary" onClick={() => {
                        setBackgroundUrl('');
                        // FIX: Cast element to HTMLInputElement to safely access 'value' property.
                        const bgUrlInput = document.getElementById('bgUrl') as HTMLInputElement | null;
                        if (bgUrlInput) {
                            bgUrlInput.value = '';
                        }
                    }}>
                        Hapus Latar Belakang
                    </button>
                </div>
            </form>
        </div>
    );


    // --- MAIN RENDER LOGIC ---
    const renderContent = () => {
        if (loading && appState !== 'admin_question_management') {
            return <div className="card"><div className="loading-spinner"></div></div>;
        }

        switch (appState) {
            case 'login': return renderLogin();
            case 'student_profile_completion': return renderStudentProfileCompletion();
            case 'student_dashboard': return renderStudentDashboard();
            case 'student_results': return renderStudentResults();
            case 'admin_dashboard': return renderAdminDashboard();
            case 'admin_user_management': return renderAdminUserManagement();
            case 'admin_category_management': return renderAdminCategoryManagement();
            case 'admin_question_management': return renderAdminQuestionManagement();
            case 'admin_question_review': return renderAdminQuestionReview();
            case 'admin_results_recap': return renderAdminResultsRecap();
            case 'admin_result_detail': return renderAdminResultDetail();
            case 'admin_background_management': return renderAdminBackgroundManagement();
            case 'quiz_section': return renderQuiz();
            default: return renderLogin();
        }
    };

    return <div className="app-container">{renderContent()}</div>;
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<App />);
} else {
    console.error("Failed to find the root element");
}