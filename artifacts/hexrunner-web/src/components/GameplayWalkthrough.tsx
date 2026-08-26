import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useRef } from 'react';

const steps = [
  {
    num: "1",
    title: "Run or ride - every move counts",
    desc: "Start a run in the app or sync from your watch. Every street, block, and loop is up for grabs."
  },
  {
    num: "2",
    title: "Your route becomes your territory",
    desc: "Finish your activity and the ground you covered is claimed in your color. Close loops to capture blocks."
  },
  {
    num: "3",
    title: "Defend your turf, steal theirs",
    desc: "Territory is never safe. Rivals can take what's yours, and you can strike back. Keep moving to hold ground."
  }
];

export function GameplayWalkthrough() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"]
  });

  return (
    <div ref={ref} className="relative min-h-[180vh] md:h-[400vh] bg-[#0A1A14] w-full z-30">
      {/* Sticky Container */}
      <div className="relative min-h-screen w-full flex flex-col items-center justify-center px-5 py-24 md:sticky md:top-0 md:h-screen md:flex-row md:p-12 lg:p-24 md:overflow-hidden">
        
        {/* Left Side: Copy */}
        <div className="flex-1 w-full max-w-lg z-10">
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-black text-white uppercase tracking-tighter mb-10 md:mb-16 leading-[0.9]">
            HOW THE GAME<br/>
            <span className="text-primary">WORKS.</span>
          </h2>

          <div className="space-y-8 md:space-y-10">
            {steps.map((step, index) => (
              <WalkthroughStep
                key={step.num}
                index={index}
                progress={scrollYProgress}
                step={step}
              />
            ))}
          </div>
        </div>

        {/* Right Side: Phone Shell */}
        <div className="flex-1 w-full flex justify-center items-center mt-14 mb-10 md:mt-0 md:mb-0 relative">
          <div className="relative aspect-[1/2.1] w-full max-w-[260px] md:max-w-[340px] rounded-[2.5rem] md:rounded-[3rem] border-[10px] md:border-[14px] border-zinc-900 bg-black overflow-hidden shadow-2xl">
            <div className="absolute top-0 inset-x-0 h-7 bg-zinc-900 rounded-b-3xl w-40 mx-auto z-50" />
            
            <Screen1 progress={scrollYProgress} />
            <Screen2 progress={scrollYProgress} />
            <Screen3 progress={scrollYProgress} />
            
          </div>
        </div>

      </div>
    </div>
  );
}

function WalkthroughStep({
  index,
  progress,
  step,
}: {
  index: number;
  progress: MotionValue<number>;
  step: (typeof steps)[number];
}) {
  const start = index * 0.33;
  const end = (index + 1) * 0.33;
  const fadeInStart = Math.max(0, start - 0.1);
  const activeStart = Math.max(fadeInStart + 0.001, start);
  const activeEnd = Math.min(0.999, end);
  const fadeOutEnd = Math.min(1, end + 0.1);
  const opacity = useTransform(
    progress,
    [fadeInStart, activeStart, activeEnd, fadeOutEnd],
    [0.3, 1, 1, 0.3],
  );

  return (
    <motion.div style={{ opacity }} className="flex gap-6">
      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-black text-xl border border-primary/50 shadow-[0_0_20px_rgba(0,230,118,0.2)]">
        {step.num}
      </div>
      <div>
        <h3 className="text-2xl font-bold text-white mb-3 tracking-tight">{step.title}</h3>
        <p className="text-zinc-400 font-medium leading-relaxed text-lg">{step.desc}</p>
      </div>
    </motion.div>
  );
}

function Screen1({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0, 0.3, 0.35], [1, 1, 0]);
  const y = useTransform(progress, [0.3, 0.35], ["0%", "-10%"]);
  return (
    <motion.div style={{ opacity, y }} className="absolute inset-0 bg-[#050505] flex flex-col items-center justify-center p-6">
      <div className="w-full h-1/2 bg-zinc-900 rounded-3xl mb-6 p-6 flex flex-col items-center justify-center border border-white/5 shadow-inner">
        <div className="text-5xl md:text-7xl font-mono font-bold text-white tracking-tighter">00:00</div>
        <div className="text-primary text-xs font-bold uppercase tracking-[0.2em] mt-3">Ready to move</div>
      </div>
      <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-primary flex items-center justify-center shadow-[0_0_40px_rgba(0,230,118,0.4)] cursor-pointer hover:scale-105 transition-transform">
        <div className="w-8 h-8 bg-[#050505] rounded-sm" />
      </div>
    </motion.div>
  );
}

function Screen2({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0.25, 0.33, 0.66, 0.7], [0, 1, 1, 0]);
  const y = useTransform(progress, [0.25, 0.33, 0.66, 0.7], ["10%", "0%", "0%", "-10%"]);
  return (
    <motion.div style={{ opacity, y }} className="absolute inset-0 bg-[#050505]">
      <img src={`${import.meta.env.BASE_URL}images/earth-night.png`} alt="Map" className="w-full h-full object-cover opacity-80 scale-150" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
      
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <svg viewBox="0 0 100 200" className="w-3/4 h-3/4" preserveAspectRatio="none">
          <path d="M 50 150 L 30 120 L 70 80 L 40 40" fill="none" stroke="var(--color-primary)" strokeWidth="6" className="drop-shadow-[0_0_12px_rgba(0,230,118,1)]" strokeDasharray="10 4" />
        </svg>
      </div>
      <div className="absolute top-16 inset-x-6 bg-black/80 backdrop-blur-md rounded-2xl p-5 border border-primary/30 shadow-xl">
        <div className="text-[10px] text-zinc-400 uppercase font-bold text-center tracking-widest">Closing loop</div>
        <div className="h-3 w-full bg-zinc-800 rounded-full mt-3 overflow-hidden">
          <div className="h-full bg-primary w-[85%] rounded-full shadow-[0_0_10px_rgba(0,230,118,0.8)]" />
        </div>
      </div>
    </motion.div>
  );
}

function Screen3({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0.6, 0.66, 1], [0, 1, 1]);
  const y = useTransform(progress, [0.6, 0.66], ["10%", "0%"]);
  return (
    <motion.div style={{ opacity, y }} className="absolute inset-0 bg-[#050505]">
      <img src={`${import.meta.env.BASE_URL}images/earth-night.png`} alt="Map Grid" className="w-full h-full object-cover opacity-50 scale-150" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-black/80 pointer-events-none" />
      
      <div className="absolute inset-0 grid grid-cols-4 grid-rows-8 gap-1.5 p-4 opacity-70">
        {Array.from({ length: 32 }).map((_, i) => (
          <div key={i} className={`clip-path-hex ${
            i === 14 || i === 15 ? 'bg-red-500 animate-pulse' : 
            i % 5 === 0 ? 'bg-primary' : 
            i % 2 === 0 ? 'bg-primary/20' : 
            'bg-white/5'
          }`} />
        ))}
      </div>
      <div className="absolute bottom-12 inset-x-6 bg-black/90 backdrop-blur-md rounded-2xl p-5 border border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
        <div className="text-red-500 text-[10px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Under Attack
        </div>
        <div className="text-white text-lg font-bold leading-tight">Rival capturing your Downtown hexes</div>
      </div>
    </motion.div>
  );
}
