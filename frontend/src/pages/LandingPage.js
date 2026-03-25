import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import HowItWorks from '../components/HowItWorks';
import Features from '../components/Features';
import Cta from '../components/Cta';
import Footer from '../components/Footer';

const LandingPage = () => {
    const { user, login } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState({});

    useEffect(() => {
        // Fetch stats from your API
        const fetchStats = async () => {
            try {
                const response = await fetch('https://api.yoursite.com/stats');
                const data = await response.json();
                setStats(data);
            } catch (error) {
                console.error('Error fetching stats:', error);
            }
        };
        fetchStats();
    }, []);

    const handleLogin = async () => {
        try {
            await login('https://auth.emergentagent.com');
            navigate('/dashboard');
        } catch (error) {
            console.error('Failed to log in:', error);
        }
    };

    return (
        <div>
            <Navbar />
            <Hero stats={stats} onLogin={handleLogin} />
            <HowItWorks />
            <Features />
            <Cta />
            <Footer />
        </div>
    );
};

export default LandingPage;