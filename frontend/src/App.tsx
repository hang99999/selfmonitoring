import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Timeline from './pages/Timeline';
import History from './pages/History';
import BottomNav from './components/BottomNav';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white pb-20">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/history" element={<History />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
