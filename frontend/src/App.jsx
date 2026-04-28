import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [encodedPreview, setEncodedPreview] = useState(null);
  const [encodedBlob, setEncodedBlob] = useState(null);
  
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [decodedMessage, setDecodedMessage] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState(''); // 'encode' or 'decode'
  const [error, setError] = useState('');
  const [shakeError, setShakeError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [isDragging, setIsDragging] = useState(false);
  const [maxCapacity, setMaxCapacity] = useState(0);

  const fileInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (error) {
      setShakeError(true);
      const timer = setTimeout(() => setShakeError(false), 500);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const calculateCapacity = (imageFile) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(imageFile);
    img.onload = () => {
      // Each pixel holds 3 bits. Convert bits to bytes (divide by 8).
      // Subtract ~64 bytes safety net for headers/encryption overhead padding.
      const capacity = Math.floor((img.width * img.height * 3) / 8) - 64; 
      setMaxCapacity(capacity > 0 ? capacity : 0);
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  };

  const handleFile = (selected) => {
    if (selected && selected.type.startsWith('image/')) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
      setEncodedPreview(null);
      setEncodedBlob(null);
      setDecodedMessage('');
      setError('');
      calculateCapacity(selected);
    } else {
      setError('Please upload a valid image file.');
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    handleFile(e.target.files[0]);
  };

  const clearImage = () => {
    setFile(null);
    setPreview(null);
    setEncodedPreview(null);
    setEncodedBlob(null);
    setDecodedMessage('');
    setPassword('');
    setMessage('');
    setMaxCapacity(0);
    setError('');
  };

  const handleEncode = async () => {
    if (!file || !message || !password) {
      setError('Please provide an image, a message, and a password for encryption.');
      return;
    }
    setError('');
    setDecodedMessage('');
    setLoading(true);
    setActionType('encode');
    
    const formData = new FormData();
    formData.append('image', file);
    formData.append('message', message);
    formData.append('password', password);

    try {
      const response = await fetch('http://127.0.0.1:5000/encode', {
        method: 'POST', body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to encode image');
      }

      const blob = await response.blob();
      setEncodedBlob(blob);
      setEncodedPreview(URL.createObjectURL(blob));
      setMessage('');
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setActionType('');
    }
  };

  const handleDecode = async () => {
    if (!file || !password) {
      setError('Please select an image and provide the decryption password.');
      return;
    }
    setError('');
    setDecodedMessage('');
    setLoading(true);
    setActionType('decode');
    
    const formData = new FormData();
    formData.append('image', file);
    formData.append('password', password);

    try {
      const response = await fetch('http://127.0.0.1:5000/decode', {
        method: 'POST', body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to decode image');
      }

      const data = await response.json();
      setDecodedMessage(data.message);
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setActionType('');
    }
  };

  const downloadImage = () => {
    if (!encodedBlob) return;
    const downloadUrl = URL.createObjectURL(encodedBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `encoded_secret_${file.name.endsWith('.png') ? file.name : file.name.split('.')[0] + '.png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  const shareImage = async () => {
    if (!encodedBlob) return;
    const shareFile = new File([encodedBlob], `encoded_secret.png`, { type: encodedBlob.type || 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [shareFile] })) {
      try {
        await navigator.share({
          title: 'SecretLens Image',
          text: 'Here is my hidden message image!',
          files: [shareFile],
        });
      } catch (err) {
        console.error('Share failed', err);
      }
    } else {
      // Fallback
      downloadImage();
    }
  };

  return (
    <div className="container">
      <nav className="navbar">
        <div className="logo">
          <span className="logo-icon">🔍</span> SecretLens
        </div>
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle Theme">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </nav>

      <header className="header">
        <p>Hide or reveal secret encrypted text inside any image using LSB steganography.</p>
      </header>
      
      <main className={`main-card ${loading ? 'isLoading' : ''}`}>
        {loading && (
          <div className="overlay-loader fade-in">
            <div className="spinner"></div>
            <p>{actionType === 'encode' ? 'Encrypting & Hiding Message...' : 'Decoding Secret Message...'}</p>
          </div>
        )}
        <div className="upload-section">
          {preview ? (
            <div className={`image-comparison-board ${encodedPreview ? 'two-col' : ''}`}>
              <div className="image-panel">
                <h4>Original Drop</h4>
                <div className="preview-container">
                  <img src={preview} alt="Upload preview" className="image-preview" />
                  <button className="clear-btn" onClick={clearImage}>✕ Clear</button>
                </div>
              </div>
              
              {encodedPreview && (
                <div className="image-panel">
                  <h4>Encoded Result</h4>
                  <div className="preview-container encoded">
                    <img src={encodedPreview} alt="Encoded result" className="image-preview" />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div 
              className={`file-input-container ${isDragging ? 'dragging' : ''}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <label className="file-upload-label">
                <span className="upload-icon">📥</span>
                <span>Drag & Drop an image here</span>
                <span className="upload-subtitle">or click to browse</span>
              </label>
              <input 
                ref={fileInputRef}
                id="file-upload" 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                className="hidden-input"
              />
            </div>
          )}
        </div>

        {encodedPreview ? (
          <div className="share-section fade-in">
            <h3 className="success-msg">
              {isSuccess ? '✅ Image Encoded Successfully!' : '✅ Encoded Result'}
            </h3>
            <div className="button-group horizontal">
              <button className="action-btn share-btn" onClick={downloadImage}>
                💾 Download
              </button>
              <button className="action-btn share-btn alt" onClick={shareImage}>
                📤 Share
              </button>
            </div>
          </div>
        ) : (
          <div className="input-section">
            <div className="textarea-wrapper">
              <textarea
                placeholder="Type a secret message to hide..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="message-input"
                rows="4"
                disabled={!file}
              />
              {maxCapacity > 0 && (
                <div className={`capacity-indicator ${message.length > maxCapacity ? 'exceeded' : ''}`}>
                  {message.length} / {maxCapacity} chars
                </div>
              )}
            </div>
            
            <input
              type="password"
              placeholder="Enter encryption/decryption password 🔐"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="password-input"
            />
          </div>
        )}

        {error && <div className={`error-message ${shakeError ? 'shake' : ''}`}>{error}</div>}

        {!encodedPreview && (
          <div className="button-group">
            <button 
              className={`action-btn encode-btn ${loading && actionType === 'encode' ? 'loading pulse' : ''}`} 
              onClick={handleEncode}
              disabled={loading || !file || !message || !password || message.length > maxCapacity}
            >
              {loading && actionType === 'encode' ? 'Processing...' : '🔒 Encode & Hide'}
            </button>

            <button 
              className={`action-btn decode-btn ${loading && actionType === 'decode' ? 'loading pulse' : ''}`} 
              onClick={handleDecode}
              disabled={loading || !file || !password || message.length > 0}
              title={message.length > 0 ? "Clear the message field to decode" : ""}
            >
              {loading && actionType === 'decode' ? 'Extracting...' : '🔓 Decode Image'}
            </button>
          </div>
        )}

        {decodedMessage && (
          <div className="decoded-message-box fade-in">
            <h3>🔓 Decoded Message:</h3>
            <p>{decodedMessage}</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
