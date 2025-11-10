import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// DIAGNOSTIC: This should appear in console immediately
console.log("🚀 APP STARTING - index.js loaded");
console.log("🚀 React version:", React.version);
console.log("🚀 Timestamp:", new Date().toISOString());

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log("🚀 App component rendered");
