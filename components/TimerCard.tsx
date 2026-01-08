
import React, { useState } from 'react';
import { Timer } from '../types';

interface TimerCardProps {
  timer: Timer;
  onUpdate: (id: string, updates: Partial<Timer>) => void;
  onDelete: (id: string) => void;
  isReadOnly: boolean;
  isDarkMode: boolean;
}

const TimerCard: React.FC<TimerCardProps> = ({ timer, onUpdate, onDelete, isReadOnly, isDarkMode }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(timer.name);
  const [editMinutes, setEditMinutes] = useState(Math.floor(timer.initialSeconds / 60));
  const [editSeconds, setEditSeconds] = useState(timer.initialSeconds % 60);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = (timer.remainingSeconds / timer.initialSeconds) * 100;

  const handleSave = () => {
    const totalSeconds = (editMinutes * 60) + editSeconds;
    onUpdate(timer.id, {
      name: editName,
      initialSeconds: totalSeconds,
      remainingSeconds: totalSeconds,
    });
    setIsEditing(false);
  };

  const toggleRun = () => {
    if (isReadOnly) return;
    onUpdate(timer.id, { isRunning: !timer.isRunning });
  };

  const reset = () => {
    if (isReadOnly) return;
    onUpdate(timer.id, { 
      remainingSeconds: timer.initialSeconds, 
      isRunning: false 
    });
  };

  const cardBase = isDarkMode 
    ? 'bg-slate-800 border-slate-700 hover:border-slate-600' 
    : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm';
  const textTitle = isDarkMode ? 'text-slate-200' : 'text-slate-800';
  const textMono = isDarkMode ? 'text-white' : 'text-slate-900';
  const inputBg = isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200';
  const progressBg = isDarkMode ? 'bg-slate-900' : 'bg-slate-100';
  const btnReset = isDarkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900';

  return (
    <div className={`relative group p-6 rounded-2xl border-2 transition-all duration-300 ${timer.isRunning ? 'border-indigo-500 shadow-lg shadow-indigo-500/20' : cardBase}`}>
      {!isReadOnly && (
        <button 
          onClick={() => onDelete(timer.id)}
          className="absolute top-4 right-4 text-slate-400 hover:text-rose-500 transition-colors"
          title="Delete Timer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {isEditing ? (
        <div className="space-y-4">
          <input 
            type="text" 
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className={`w-full ${inputBg} border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
            placeholder="Timer name"
          />
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">Mins</label>
              <input 
                type="number" 
                value={editMinutes}
                onChange={(e) => setEditMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                className={`w-full ${inputBg} border rounded-lg px-3 py-2 text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
              />
            </div>
            <span className={`mt-6 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>:</span>
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">Secs</label>
              <input 
                type="number" 
                value={editSeconds}
                onChange={(e) => setEditSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                className={`w-full ${inputBg} border rounded-lg px-3 py-2 text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button 
              onClick={handleSave}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
            >
              Save
            </button>
            <button 
              onClick={() => setIsEditing(false)}
              className={`${isDarkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-200 hover:bg-slate-300'} flex-1 text-sm font-semibold py-2 rounded-lg transition-colors ${isDarkMode ? 'text-white' : 'text-slate-700'}`}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-1 flex justify-between items-start">
            <h3 className={`font-bold truncate pr-6 ${textTitle}`}>{timer.name}</h3>
          </div>
          
          <div className="mb-6 mt-4">
            <div className={`text-5xl font-mono-custom font-bold text-center tracking-tighter tabular-nums ${textMono}`}>
              {formatTime(timer.remainingSeconds)}
            </div>
          </div>

          <div className={`w-full ${progressBg} h-2 rounded-full overflow-hidden mb-6`}>
            <div 
              className={`h-full transition-all duration-300 ${timer.isRunning ? 'bg-indigo-500' : 'bg-slate-400'}`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={toggleRun}
              disabled={isReadOnly}
              className={`flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-bold transition-all ${
                isReadOnly ? 'opacity-50 cursor-not-allowed grayscale' : ''
              } ${
                timer.isRunning 
                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md active:shadow-none'
              }`}
            >
              {timer.isRunning ? (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  Pause
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                  Start
                </>
              )}
            </button>
            <button 
              onClick={reset}
              disabled={isReadOnly}
              className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all ${btnReset} ${
                isReadOnly ? 'opacity-50 cursor-not-allowed grayscale' : ''
              }`}
              title="Reset"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            {!isReadOnly && (
              <button 
                onClick={() => setIsEditing(true)}
                className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all ${btnReset}`}
                title="Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TimerCard;
