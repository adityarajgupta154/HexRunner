import { useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { Hero } from './components/Hero';
import { HandsetReveal } from './components/HandsetReveal';
import { WorldStageStats } from './components/WorldStageStats';
import { GameplayWalkthrough } from './components/GameplayWalkthrough';
import { ActivityCard } from './components/ActivityCard';
import { FeatureCards } from './components/FeatureCards';
import { FAQ } from './components/FAQ';
import { EndState } from './components/EndState';
import { StoreModal } from './components/StoreModal';

function App() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-[#030712] min-h-screen text-foreground selection:bg-primary selection:text-[#030712] overflow-x-clip overflow-y-visible font-sans relative">
        <Hero onStoreClick={() => setModalOpen(true)} />
        <HandsetReveal />
        <WorldStageStats />
        <GameplayWalkthrough />
        <ActivityCard />
        <FeatureCards />
        <FAQ />
        <EndState onStoreClick={() => setModalOpen(true)} />

        <StoreModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </div>
    </MotionConfig>
  );
}

export default App;
