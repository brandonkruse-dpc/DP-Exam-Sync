
import React, { useState } from 'react';
import htm from 'htm';

const html = htm.bind(React.createElement);

export default function TimerCard({ timer, onUpdate, onDelete, isReadOnly, isDarkMode }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(timer.name);
  const [editMinutes, setEditMinutes] = useState(Math.floor(timer.initialSeconds / 60));
  const [editSeconds, setEditSeconds] = useState(timer.initialSeconds % 60);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const saveEdit = () => {
    const total = (parseInt(editMinutes) || 0) * 60 + (parseInt(editSeconds) || 0);
    onUpdate(timer.id, { name: editName, initialSeconds: total, remainingSeconds: total });
    setIsEditing(false);
  };

  const progress = (timer.remainingSeconds / timer.initialSeconds) * 100;

  return html`
    <div className=${`relative p-6 rounded-2xl border-2 transition-all ${timer.isRunning ? 'border-indigo-500 shadow-lg' : isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      ${!isReadOnly && html`
        <button onClick=${() => onDelete(timer.id)} className="absolute top-4 right-4 text-slate-400 hover:text-rose-500">×</button>
      `}

      ${isEditing ? html`
        <div className="space-y-4">
          <input value=${editName} onChange=${e => setEditName(e.target.value)} className="w-full bg-slate-900 text-white rounded-lg p-2 text-sm" />
          <div className="flex gap-2">
            <input type="number" value=${editMinutes} onChange=${e => setEditMinutes(e.target.value)} className="w-full bg-slate-900 text-white rounded-lg p-2 text-sm" />
            <input type="number" value=${editSeconds} onChange=${e => setEditSeconds(e.target.value)} className="w-full bg-slate-900 text-white rounded-lg p-2 text-sm" />
          </div>
          <button onClick=${saveEdit} className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold">Save</button>
        </div>
      ` : html`
        <div>
          <h3 className="font-bold mb-4 truncate pr-6">${timer.name}</h3>
          <div className="text-5xl font-mono-custom font-bold text-center mb-6 tracking-tighter">${formatTime(timer.remainingSeconds)}</div>
          <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mb-6">
            <div className="bg-indigo-500 h-full transition-all" style=${{ width: `${progress}%` }}></div>
          </div>
          <div className="flex gap-2">
            <button 
              disabled=${isReadOnly}
              onClick=${() => onUpdate(timer.id, { isRunning: !timer.isRunning })}
              className=${`flex-1 py-3 rounded-xl font-bold transition-all ${timer.isRunning ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white'}`}
            >
              ${timer.isRunning ? 'Pause' : 'Start'}
            </button>
            <button 
              disabled=${isReadOnly}
              onClick=${() => onUpdate(timer.id, { remainingSeconds: timer.initialSeconds, isRunning: false })}
              className="px-4 py-3 bg-slate-700 text-white rounded-xl"
            >
              Reset
            </button>
            ${!isReadOnly && html`
              <button onClick=${() => setIsEditing(true)} className="px-4 py-3 bg-slate-700 text-white rounded-xl">Edit</button>
            `}
          </div>
        </div>
      `}
    </div>
  `;
}
