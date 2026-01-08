
import React, { useState, useEffect, useRef } from 'react';
import htm from 'htm';
import TimerCard from './components/TimerCard.js';

const html = htm.bind(React.createElement);
const MAX_TIMERS = 12;
const MAX_CHILDREN = 4;
const DEFAULT_TIMER_SECONDS = 3600; 
const RECONNECT_INTERVAL = 5000; 

export default function App() {
  const [timers, setTimers] = useState([]);
  const [role, setRole] = useState('standalone'); // 'standalone', 'parent', 'child'
  const [peerId, setPeerId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [connectedPeersCount, setConnectedPeersCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isServerConnected, setIsServerConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const peerRef = useRef(null);
  const connectionsRef = useRef([]); 
  const timersRef = useRef(timers);
  const reconnectTimeoutRef = useRef(null);
  const roleRef = useRef(role);
  const targetIdRef = useRef(targetId);
  const isInitializingRef = useRef(false);
  const shouldReconnectRef = useRef(true); // Flag to track if we should try auto-resync

  // Clock Update
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    roleRef.current = role;
    targetIdRef.current = targetId;
  }, [role, targetId]);

  // Sync timers and broadcast
  useEffect(() => {
    timersRef.current = timers;
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    
    // Parent broadcasts to all children
    if (role === 'parent' && connectionsRef.current.length > 0) {
      const message = { type: 'SYNC_STATE', payload: { timers } };
      connectionsRef.current.forEach(conn => {
        if (conn && conn.open) {
          conn.send(message);
        }
      });
    }
  }, [timers, role, isDarkMode]);

  // Robust Peer initialization and signaling recovery
  const initPeer = (preferredId = null) => {
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;

    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch (e) {
        console.error('Error destroying peer:', e);
      }
      peerRef.current = null;
    }

    const assignedId = preferredId || Math.floor(1000 + Math.random() * 9000).toString();
    console.log(`[Networking] Initializing Peer Node with ID: ${assignedId}`);

    const peer = new window.Peer(assignedId, {
      debug: 1,
      config: {
        'iceServers': [
          { url: 'stun:stun.l.google.com:19302' },
          { url: 'stun:stun1.l.google.com:19302' },
          { url: 'stun:stun2.l.google.com:19302' }
        ]
      }
    });

    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log(`[Networking] Connected to signaling server. Node ID: ${id}`);
      setPeerId(id);
      setIsServerConnected(true);
      isInitializingRef.current = false;
    });

    peer.on('disconnected', () => {
      setIsServerConnected(false);
      console.warn('[Networking] Peer disconnected from signaling server. Attempting recovery...');
      if (peer && !peer.destroyed) {
        peer.reconnect();
      }
    });

    peer.on('close', () => {
      console.warn('[Networking] Peer instance closed.');
      setIsServerConnected(false);
      isInitializingRef.current = false;
    });

    peer.on('error', (err) => {
      console.error(`[Networking] PeerJS Error [${err.type}]:`, err.message);
      isInitializingRef.current = false;
      
      const fatalErrors = ['lost-connection', 'network', 'server-error', 'socket-error'];
      if (fatalErrors.includes(err.type)) {
        setIsServerConnected(false);
        if (peer && !peer.destroyed) {
          peer.destroy();
        }
        console.log(`[Networking] Fatal error encountered. Scheduling re-initialization in ${RECONNECT_INTERVAL}ms...`);
        setTimeout(() => initPeer(assignedId), RECONNECT_INTERVAL);
      } else if (err.type === 'unavailable-id') {
        console.warn('[Networking] ID unavailable, trying a fresh ID...');
        setTimeout(() => initPeer(), 1000);
      }
    });

    // Parent Logic: Accept cluster connections
    peer.on('connection', (conn) => {
      const activeConns = connectionsRef.current.filter(c => c.open);
      if (activeConns.length >= MAX_CHILDREN) {
        conn.on('open', () => {
          conn.send({ type: 'ERROR', message: 'Parent cluster capacity reached.' });
          setTimeout(() => conn.close(), 1000);
        });
        return;
      }

      setRole('parent');
      setConnectionStatus('connected');
      
      conn.on('open', () => {
        if (!connectionsRef.current.find(c => c.peer === conn.peer)) {
          connectionsRef.current.push(conn);
        }
        setConnectedPeersCount(connectionsRef.current.filter(c => c.open).length);
        conn.send({ type: 'SYNC_STATE', payload: { timers: timersRef.current } });
        console.log(`[Cluster] Child node joined: ${conn.peer}`);
      });

      const handleCleanup = () => {
        console.log(`[Cluster] Node connection terminated: ${conn.peer}`);
        connectionsRef.current = connectionsRef.current.filter(c => c.peer !== conn.peer);
        const remaining = connectionsRef.current.filter(c => c.open).length;
        setConnectedPeersCount(remaining);
        if (remaining === 0 && roleRef.current === 'parent') {
          setRole('standalone');
          setConnectionStatus('disconnected');
        }
      };

      conn.on('close', handleCleanup);
      conn.on('error', handleCleanup);
    });
  };

  useEffect(() => {
    initPeer();
    return () => {
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  // Primary Timer Engine (Parent/Standalone only)
  useEffect(() => {
    if (role === 'child') return;
    const interval = setInterval(() => {
      setTimers(prev => prev.map(t => {
        if (t.isRunning && t.remainingSeconds > 0) {
          return { ...t, remainingSeconds: t.remainingSeconds - 1 };
        } else if (t.isRunning && t.remainingSeconds === 0) {
          return { ...t, isRunning: false };
        }
        return t;
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [role]);

  // Join sequence for Child nodes
  const connectToParent = (forcedId) => {
    const target = forcedId || targetId;
    if (!peerRef.current || peerRef.current.destroyed || !isServerConnected) {
      console.warn('[Cluster] Cannot connect: signaling server is offline.');
      if (!peerRef.current || peerRef.current.destroyed) initPeer();
      return;
    }
    
    setConnectionStatus('connecting');
    shouldReconnectRef.current = true; // Reset reconnection allowance
    
    // Ensure clean state: Disconnect existing parent link if any (Ensure only one parent)
    connectionsRef.current.forEach(c => c.close());
    
    const conn = peerRef.current.connect(target, { 
      reliable: true,
      label: 'sync-stream'
    });
    
    conn.on('open', () => {
      console.log(`[Cluster] Successfully joined Parent node: ${target}`);
      setRole('child');
      setConnectionStatus('connected');
      connectionsRef.current = [conn];
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    });

    conn.on('data', (data) => {
      if (data.type === 'SYNC_STATE') {
        setTimers(data.payload.timers);
      } else if (data.type === 'ERROR') {
        alert(data.message);
        disconnectAll();
      } else if (data.type === 'DISCONNECT_NOTICE') {
        console.log('[Cluster] Received manual disconnect notice from Parent.');
        shouldReconnectRef.current = false;
        disconnectAll();
      }
    });

    const handleChildDisconnect = () => {
      if (roleRef.current === 'child') {
        if (shouldReconnectRef.current) {
          console.warn('[Cluster] Parent link lost unintentionally. Attempting auto-rejoin...');
          setConnectionStatus('reconnecting');
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => connectToParent(target), RECONNECT_INTERVAL);
        } else {
          console.log('[Cluster] Connection terminated by user or parent. Auto-rejoin disabled.');
          setRole('standalone');
          setConnectionStatus('disconnected');
        }
      }
    };

    conn.on('close', handleChildDisconnect);
    conn.on('error', (err) => {
      console.error('[Cluster] Connection Error:', err);
      handleChildDisconnect();
    });
  };

  const disconnectAll = () => {
    console.log('[Cluster] Terminating all network connections.');
    shouldReconnectRef.current = false; // Disable auto-rejoin on manual disconnect
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    
    // If we are a parent, signal to all children that they should not reconnect
    if (role === 'parent') {
      connectionsRef.current.forEach(conn => {
        if (conn && conn.open) {
          conn.send({ type: 'DISCONNECT_NOTICE' });
        }
      });
    }

    connectionsRef.current.forEach(c => c.close());
    connectionsRef.current = [];
    setRole('standalone');
    setConnectionStatus('disconnected');
    setConnectedPeersCount(0);
  };

  const addTimer = () => {
    if (timers.length >= MAX_TIMERS) return;
    const newTimer = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Exam Segment ${timers.length + 1}`,
      initialSeconds: DEFAULT_TIMER_SECONDS,
      remainingSeconds: DEFAULT_TIMER_SECONDS,
      isRunning: false
    };
    setTimers([...timers, newTimer]);
  };

  const timeString = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  return html`
    <div className=${`min-h-screen transition-all duration-500 flex flex-col p-4 md:p-8 ${isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <header className="max-w-7xl mx-auto w-full mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">DP Exam <span className="text-indigo-600">Sync</span></h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                ${isServerConnected 
                  ? html`<span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Signaling Active</span>` 
                  : html`<span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500 animate-bounce"></span> Signaling Offline</span>`}
                ${role === 'child' && isServerConnected && html`<span className="text-emerald-500 ml-2">• P2P Active</span>`}
              </p>
            </div>
          </div>

          <!-- Centered Clock -->
          <div className="md:absolute md:left-1/2 md:-translate-x-1/2 flex flex-col items-center">
             <div className=${`text-2xl font-mono-custom font-bold tracking-widest ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>
               ${timeString}
             </div>
             <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em]">Local Reference Time</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick=${() => setIsDarkMode(!isDarkMode)} className=${`p-3 rounded-xl border transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-white border-slate-200 text-slate-600'}`}>
              ${isDarkMode ? '☀️' : '🌙'}
            </button>
            ${role !== 'child' && html`
              <button onClick=${addTimer} className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">Add Timer</button>
              <button onClick=${() => setTimers(timers.map(t => ({...t, isRunning: true})))} className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 active:scale-95 transition-all">Start All</button>
              <button onClick=${() => setTimers(timers.map(t => ({...t, isRunning: false})))} className=${`px-5 py-3 rounded-xl font-bold text-sm transition-all ${isDarkMode ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>Pause All</button>
            `}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full flex-1">
        ${timers.length === 0 ? html`
          <div className="h-64 border-4 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="font-bold text-lg text-slate-400">Cluster Standby</p>
            <p className="text-sm">Configure sequences on the Parent authority to begin synchronization.</p>
          </div>
        ` : html`
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            ${timers.map(timer => html`
              <${TimerCard} 
                key=${timer.id} 
                timer=${timer} 
                isDarkMode=${isDarkMode} 
                isReadOnly=${role === 'child'}
                onUpdate=${(id, updates) => setTimers(timers.map(t => t.id === id ? {...t, ...updates} : t))}
                onDelete=${(id) => setTimers(timers.filter(t => t.id !== id))}
              />
            `)}
          </div>
        `}
      </main>

      <footer className="mt-12 max-w-7xl mx-auto w-full">
        <div className=${`p-6 rounded-3xl border-2 transition-all ${isDarkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200 shadow-xl'}`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className=${`w-4 h-4 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-500' : connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`}></div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Cluster Networking: ${connectionStatus.toUpperCase()}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-mono font-bold text-indigo-500 select-all tracking-widest">${peerId || '...'}</p>
                  ${role === 'parent' && html`
                    <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">
                      Parent Authority • ${connectedPeersCount} / ${MAX_CHILDREN} Nodes Active
                    </span>
                  `}
                </div>
              </div>
            </div>

            ${role === 'standalone' ? html`
              <div className="flex gap-2 w-full lg:w-auto">
                <input 
                  type="text"
                  value=${targetId} 
                  onChange=${(e) => setTargetId(e.target.value)} 
                  placeholder="Parent Cluster ID" 
                  className=${`flex-1 lg:w-48 border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} 
                />
                <button 
                  disabled=${!isServerConnected}
                  onClick=${() => connectToParent()} 
                  className="bg-indigo-600 text-white px-8 py-2 rounded-xl font-bold text-sm hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Join Parent
                </button>
              </div>
            ` : html`
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-end">
                   <span className="text-sm font-black text-indigo-500 uppercase tracking-widest">${role === 'child' ? 'Child Node Synced' : 'Cluster Authority (Parent)'}</span>
                   ${role === 'child' && connectionStatus === 'reconnecting' && html`<span className="text-[10px] text-amber-500 font-bold animate-pulse">Searching for Parent...</span>`}
                </div>
                <button onClick=${disconnectAll} className="px-4 py-2 bg-rose-500/10 text-rose-500 rounded-xl font-bold text-xs hover:bg-rose-500 hover:text-white transition-all">Terminate Sync</button>
              </div>
            `}
          </div>
        </div>
      </footer>
    </div>
  `;
}
