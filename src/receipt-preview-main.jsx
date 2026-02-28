import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ReceiptPreview from './pages/receipt-preview';
import './styles/tailwind.css';
import './styles/index.css';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to="/receipt-preview" replace />} />
      <Route path="/receipt-preview" element={<ReceiptPreview standalone />} />
      <Route path="/sabha-dashboard" element={<ReceiptPreview standalone />} />
      <Route path="*" element={<Navigate to="/receipt-preview" replace />} />
    </Routes>
  </BrowserRouter>
);
