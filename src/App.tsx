import { Hero } from './components/Hero';
import { HowItWorks } from './components/HowItWorks';
import { Footer } from './components/Footer';
import { TrainingPage } from './components/TrainingPage';
import { AuthPage } from './components/AuthPage';
import { PlayerPage } from './components/PlayerPage';
import { AuthBadge } from './components/AuthBadge';
import { useHashRoute, navigate } from './hooks/useHashRoute';

export default function App() {
  const route = useHashRoute();
  if (route.startsWith('/training')) {
    return <TrainingPage />;
  }
  if (route.startsWith('/login') || route.startsWith('/signup')) {
    return <AuthPage />;
  }
  if (route.startsWith('/player')) {
    return <PlayerPage />;
  }
  return <LandingPage />;
}

function LandingPage() {
  return (
    <>
      <header className="fixed top-0 right-0 z-50 p-4">
        <AuthBadge />
      </header>
      <main className="relative min-h-screen">
        <Hero onCtaClick={() => navigate('/player')} />
        <HowItWorks />
        <Footer />
      </main>
    </>
  );
}
