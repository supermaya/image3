import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useUserStore from './store/userStore';

import Home from './pages/Home';
import Admin from './pages/Admin';
import Creator from './pages/Creator';
import CreatorUpload from './pages/CreatorUpload';

function App() {
  const { initAuth, loading } = useUserStore();

  useEffect(() => {
    const unsubscribe = initAuth();
    return () => unsubscribe();
  }, [initAuth]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/creator" element={<Creator />} />
        <Route path="/upload" element={<CreatorUpload />} />
        <Route path="/create" element={<CreatorUpload />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
