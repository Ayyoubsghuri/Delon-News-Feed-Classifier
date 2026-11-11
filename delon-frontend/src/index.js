import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { isNative } from './lib/api';
import reportWebVitals from './reportWebVitals';

// The Android build is fully standalone (no server). `?mobile=1` previews it in a browser.
const standalone = isNative() || new URLSearchParams(window.location.search).has('mobile');
const MobileApp = lazy(() => import('./mobile/MobileApp'));

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {standalone ? (
      <Suspense fallback={null}>
        <MobileApp />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
