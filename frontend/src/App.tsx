import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { DriverProvider } from './contexts/DriverContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import DriverDashboard from './pages/DriverDashboard';
import BecomeDriver from './pages/BecomeDriver';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <DriverProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/driver-dashboard" element={<DriverDashboard />} />
              <Route path="/become-driver" element={<BecomeDriver />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/me" element={<Profile />} />
            </Routes>
          </BrowserRouter>
        </DriverProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
