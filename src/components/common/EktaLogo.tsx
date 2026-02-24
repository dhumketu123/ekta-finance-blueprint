import React from 'react';

const EktaLogo = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <svg width="56" height="56" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
      <defs>
        <linearGradient id="ektaGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#065f46" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <path d="M 10,90 L 45,90 L 75,55 L 50,30 L 10,30 Z" fill="url(#ektaGrad)"/>
      <path d="M 55,25 L 95,25 L 95,45 L 80,60 L 60,40 Z" fill="url(#ektaGrad)"/>
      <path d="M 80,65 L 95,50 L 95,80 L 85,90 L 65,90 Z" fill="url(#ektaGrad)"/>
    </svg>
    <div className="flex flex-col leading-none">
      <h1 className="text-3xl font-extrabold tracking-tight text-emerald-900 m-0" style={{ fontFamily: 'system-ui, sans-serif' }}>EKTA</h1>
      <span className="text-[11px] font-bold tracking-widest text-emerald-800 uppercase mt-1">FINANCE GROUP</span>
    </div>
  </div>
);

export default EktaLogo;
