
import React, { useState } from 'react';
import htm from 'htm';

const html = htm.bind(React.createElement);

export default function TimerCard({ timer, onUpdate, onDelete, isReadOnly, isDarkMode }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(timer.name);
  
  // Calculate H, M, S for initial state
  const h = Math.floor(timer.initialSeconds / 3600);
  const m = Math.floor((timer.initialSeconds % 3600) / 60);
  const s = timer.initialSeconds % 60;
  
  const [editHours, setEditHours] = useState(h);
  const [editMinutes, setEditMinutes] = useState(m);
  const [editSeconds, setEditSeconds] = useState(s);

  const formatTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    const hStr = hours > 0 ? `${hours.toString().padStart(2, '0')}:` : '';
    return `${hStr}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const saveEdit = () => {
    const total = (parseInt(editHours) || 0) * 3600 + (parseInt(editMinutes) || 0) * 60 + (parseInt(editSeconds) || 0);
    // Ensure timer is at least 1 second
    const finalTotal = Math.max(1, total);
    onUpdate(timer.id, { 
      name: editName, 
      initialSeconds: finalTotal, 
      remainingSeconds: finalTotal 
    });
    setIsEditing(false);
  };

  const progress = (timer.remainingSeconds / timer.initialSeconds) * 100;

  return html`
    <div className=${`relative p-6 rounded-3xl border-2 transition-all duration-300 flex flex-col h-full ${timer.isRunning ? 'border-indigo-500 ring-4 ring-indigo-500/10 scale-[1.02]' : isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow-lg'}`}>
      ${!isReadOnly && html`
        <button onClick=${() => onDelete(timer.id)} className="absolute top-4 right-4 text-slate-400 hover:text-rose-500 transition-colors z-10" title="Delete Timer">
           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      `}

      ${isEditing ? html`
        <div className="space-y-4 flex flex-col h-full">
          <label className="text-[10px] font-black text-slate-500 uppercase block -mb-3">Segment Name</label>
          <input 
            value=${editName} 
            onChange=${e => setEditName(e.target.value)} 
            className=${`w-full rounded-xl p-3 text-sm font-bold ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} 
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Hours</label>
              <input type="number" min="0" value=${editHours} onChange=${e => setEditHours(e.target.value)} className=${`w-full rounded-xl p-3 text-sm font-bold ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Minutes</label>
              <input type="number" min="0" max="59" value=${editMinutes} onChange=${e => setEditMinutes(e.target.value)} className=${`w-full rounded-xl p-3 text-sm font-bold ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Seconds</label>
              <input type="number" min="0" max="59" value=${editSeconds} onChange=${e => setEditSeconds(e.target.value)} className=${`w-full rounded-xl p-3 text-sm font-bold ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} />
            </div>
          </div>
          <div className="flex gap-2 mt-auto pt-4">
            <button onClick=${saveEdit} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 active:scale-95 transition-all">Save</button>
            <button onClick=${() => setIsEditing(false)} className=${`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${isDarkMode ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>Cancel</button>
          </div>
        </div>
      ` : html`
        <div className="flex flex-col h-full">
          <div className="mb-4">
            <h3 className=${`font-black text-lg truncate pr-6 ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>${timer.name}</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Initial: ${formatTime(timer.initialSeconds)}</p>
          </div>
          
          <div className=${`text-6xl font-mono-custom font-black text-center mb-6 tracking-tighter tabular-nums ${timer.isRunning ? 'text-indigo-500 animate-pulse' : isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            ${formatTime(timer.remainingSeconds)}
          </div>
          
          <div className=${`w-full h-5 rounded-full overflow-hidden mb-8 border-[3px] ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-300'}`}>
            <div className=${`h-full transition-all duration-1000 linear ${timer.remainingSeconds < 60 ? 'bg-rose-500' : 'bg-indigo-500'}`} style=${{ width: `${progress}%` }}></div>
          </div>
          
          <div className="flex gap-2 mt-auto">
            <button 
              disabled=${isReadOnly}
              onClick=${() => onUpdate(timer.id, { isRunning: !timer.isRunning })}
              className=${`flex-1 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${isReadOnly ? 'opacity-50 grayscale' : ''} ${timer.isRunning ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 active:scale-95'}`}
            >
              ${timer.isRunning ? 'Pause' : 'Start'}
            </button>
            <button 
              disabled=${isReadOnly}
              onClick=${() => onUpdate(timer.id, { remainingSeconds: timer.initialSeconds, isRunning: false })}
              className=${`px-5 py-4 rounded-2xl font-bold transition-all ${isReadOnly ? 'opacity-50 grayscale' : ''} ${isDarkMode ? 'bg-slate-700 text-slate-300 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              title="Reset"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            ${!isReadOnly && html`
              <button onClick=${() => setIsEditing(true)} className=${`px-5 py-4 rounded-2xl font-bold transition-all ${isDarkMode ? 'bg-slate-700 text-slate-300 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title="Settings">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
            `}
          </div>
        </div>
      `}
    </div>
  `;
}
