import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Timeline from './pages/Timeline';
import History from './pages/History';
import Activities from './pages/Activities';
import Chatbot from './pages/Chatbot';
import BottomNav from './components/BottomNav';

function AppShell() {
  const location = useLocation();
  const hiddenNav = location.pathname === '/chatbot';

  return (
    <div className={`min-h-screen bg-gradient-to-b from-orange-50 to-white ${hiddenNav ? '' : 'pb-20'}`}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/activities" element={<Activities />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/history" element={<History />} />
        <Route path="/chatbot" element={<Chatbot />} />
      </Routes>
      {!hiddenNav && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
