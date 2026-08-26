import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useRef, useState } from 'react';
import { useMediaQuery } from '../hooks/use-media-query';
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion';

const steps = [
  {
    num: "1",
    title: "Run or ride - every move counts",
    desc: "Start a run in the app or sync from your watch. Every street, block, and loop is up for grabs.",
    Screen: Screen1
  },
  {
    num: "2",
    title: "Your route becomes your territory",
    desc: "Finish your activity and the ground you covered is claimed in your color. Close loops to capture blocks.",
    Screen: Screen2
  },
  {
    num: "3",
    title: "Defend your turf, steal theirs",
    desc: "Territory is never safe. Rivals can take what's yours, and you can strike back. Keep moving to hold ground.",
    Screen: Screen3
  },
  {
    num: "4",
    title: "Climb the local leaderboard",
    desc: "Every hex claimed boosts your city rank. Compete against runners and riders in your neighborhood.",
    Screen: Screen4
  }
];

export function GameplayWalkthrough() {
  const ref = useRef(null);
  const reduceMotion = usePrefersReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [activeScreen, setActiveScreen] = useState(0);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"]
  });

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const nextScreen = Math.min(3, Math.floor(Math.min(0.999, latest) * 4));
    setActiveScreen((current) => current === nextScreen ? current : nextScreen);
  });

  return (
    <div ref={ref} className="relative h-auto md:h-[400vh] w-full z-30 rounded-t-[3rem] md:rounded-none shadow-[0_-20px_50px_rgba(0,0,0,0.5)] md:shadow-none bg-[#0A1A14] md:bg-transparent">
      {/* Mobile Layout: Deliberate Vertical Sequence */}
      <div className="md:hidden flex flex-col items-center justify-center px-5 py-24 gap-16">
        <div className="w-full text-center">
          <h2 className="text-4xl sm:text-5xl font-black text-white uppercase tracking-tighter mb-4 leading-[0.9]">
            HOW THE GAME<br/>
            <span className="text-primary">WORKS.</span>
          </h2>
        </div>
        {steps.map((step, index) => (
          <div key={index} className="flex flex-col items-center gap-8 w-full max-w-sm">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-black text-xl border border-primary/50 shadow-[0_0_20px_rgba(0,230,118,0.2)]">
                {step.num}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">{step.title}</h3>
                <p className="text-zinc-400 font-medium leading-relaxed">{step.desc}</p>
              </div>
            </div>
            <div className="relative aspect-[1/2.1] w-full max-w-[260px] rounded-[2.5rem] border-[10px] border-zinc-900 bg-black overflow-hidden shadow-2xl">
              <div className="absolute top-0 inset-x-0 h-5 bg-zinc-900 rounded-b-xl w-32 mx-auto z-50" />
              <step.Screen isStatic forcePoster />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Layout: Sticky Choreography */}
      <div className="gameplay-stage hidden md:flex relative min-h-screen w-full flex-col items-center justify-center px-5 py-24 md:sticky md:top-0 md:h-screen md:flex-row md:p-12 lg:p-24 md:overflow-hidden bg-[#0A1A14] rounded-t-[3rem] shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        
        {/* Left Side: Copy */}
        <div className="gameplay-copy flex-1 w-full max-w-lg z-10">
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-black text-white uppercase tracking-tighter mb-10 md:mb-16 leading-[0.9]">
            HOW THE GAME<br/>
            <span className="text-primary">WORKS.</span>
          </h2>

          <div className="space-y-8 md:space-y-10 relative">
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
        <div className="flex-1 w-full flex justify-center items-center mt-14 md:mt-0 relative">
          <div className="gameplay-phone relative aspect-[1/2.1] w-full max-w-[340px] rounded-[3rem] border-[14px] border-zinc-900 bg-black overflow-hidden shadow-2xl">
            <div className="absolute top-0 inset-x-0 h-7 bg-zinc-900 rounded-b-3xl w-40 mx-auto z-50" />
            
            {isDesktop && (
              <>
                <Screen1
                  progress={scrollYProgress}
                  shouldPlay={!reduceMotion && activeScreen === 0}
                  forcePoster={reduceMotion}
                />
                <Screen2
                  progress={scrollYProgress}
                  shouldPlay={!reduceMotion && activeScreen === 1}
                  forcePoster={reduceMotion}
                />
                <Screen3
                  progress={scrollYProgress}
                  shouldPlay={!reduceMotion && activeScreen === 2}
                  forcePoster={reduceMotion}
                />
                <Screen4 progress={scrollYProgress} />
              </>
            )}
            
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
  step: Omit<(typeof steps)[number], "Screen">;
}) {
  const start = index * 0.25;
  const end = (index + 1) * 0.25;
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

type ScreenProps = {
  progress?: MotionValue<number>;
  isStatic?: boolean;
  shouldPlay?: boolean;
  forcePoster?: boolean;
};

function Screen1({ progress, isStatic, shouldPlay, forcePoster }: ScreenProps) {
  const fallbackProgress = useMotionValue(0);
  const motionProgress = progress ?? fallbackProgress;
  const animatedOpacity = useTransform(motionProgress, [0, 0.2, 0.25], [1, 1, 0]);
  const animatedY = useTransform(motionProgress, [0.2, 0.25], ["0%", "-10%"]);
  const opacity = isStatic ? 1 : animatedOpacity;
  const y = isStatic ? "0%" : animatedY;
  return (
    <motion.div style={{ opacity, y }} className="absolute inset-0 bg-[#050505] flex items-center justify-center">
      <GameplayMedia
        alt="HexRunner location setup"
        name="location-v2"
        play={Boolean(shouldPlay) && !forcePoster}
      />
    </motion.div>
  );
}

function Screen2({ progress, isStatic, shouldPlay, forcePoster }: ScreenProps) {
  const fallbackProgress = useMotionValue(0);
  const motionProgress = progress ?? fallbackProgress;
  const animatedOpacity = useTransform(motionProgress, [0.2, 0.25, 0.45, 0.5], [0, 1, 1, 0]);
  const animatedY = useTransform(motionProgress, [0.2, 0.25, 0.45, 0.5], ["10%", "0%", "0%", "-10%"]);
  const opacity = isStatic ? 1 : animatedOpacity;
  const y = isStatic ? "0%" : animatedY;
  return (
    <motion.div style={{ opacity, y }} className="absolute inset-0 bg-[#050505] flex items-center justify-center">
      <GameplayMedia
        alt="HexRunner loop capture"
        name="close-loop-v2"
        play={Boolean(shouldPlay) && !forcePoster}
      />
    </motion.div>
  );
}

function Screen3({ progress, isStatic, shouldPlay, forcePoster }: ScreenProps) {
  const fallbackProgress = useMotionValue(0);
  const motionProgress = progress ?? fallbackProgress;
  const animatedOpacity = useTransform(motionProgress, [0.45, 0.5, 0.7, 0.75], [0, 1, 1, 0]);
  const animatedY = useTransform(motionProgress, [0.45, 0.5, 0.7, 0.75], ["10%", "0%", "0%", "-10%"]);
  const opacity = isStatic ? 1 : animatedOpacity;
  const y = isStatic ? "0%" : animatedY;
  return (
    <motion.div style={{ opacity, y }} className="absolute inset-0 bg-[#050505] flex items-center justify-center">
      <GameplayMedia
        alt="HexRunner territory battle"
        name="take-territory-v2"
        play={Boolean(shouldPlay) && !forcePoster}
      />
    </motion.div>
  );
}

function Screen4({ progress, isStatic }: ScreenProps) {
  const fallbackProgress = useMotionValue(0);
  const motionProgress = progress ?? fallbackProgress;
  const animatedOpacity = useTransform(motionProgress, [0.7, 0.75], [0, 1]);
  const animatedY = useTransform(motionProgress, [0.7, 0.75], ["10%", "0%"]);
  const opacity = isStatic ? 1 : animatedOpacity;
  const y = isStatic ? "0%" : animatedY;
  return (
    <motion.div style={{ opacity, y }} className="absolute inset-0 bg-[#050505] flex flex-col p-5 pt-12">
      <div className="text-white text-2xl font-black uppercase tracking-tight mb-6 mt-4">City Rank</div>
      <div className="flex flex-col gap-4">
        {[
          { rank: 1, name: "NIGHTRUNNER", score: "14,250", color: "bg-primary" },
          { rank: 2, name: "ALEX_V", score: "12,100", color: "bg-cyan-400" },
          { rank: 3, name: "YOU", score: "9,850", color: "bg-primary" },
          { rank: 4, name: "GHOST_TRK", score: "8,420", color: "bg-purple-500" },
          { rank: 5, name: "SAM_SPEED", score: "7,100", color: "bg-yellow-400" },
        ].map((u, i) => (
          <div key={i} className={`flex items-center gap-3 p-3 rounded-2xl ${i === 2 ? 'bg-white/10 border border-white/20' : ''}`}>
            <div className="text-zinc-500 font-mono text-sm w-4">{u.rank}</div>
            <div className={`w-8 h-8 rounded-full ${u.color} flex items-center justify-center`}>
              <div className="w-4 h-4 bg-black/50 rounded-sm" />
            </div>
            <div className="flex-1 text-white font-bold text-sm truncate">{u.name}</div>
            <div className="text-primary font-mono text-sm font-bold">{u.score}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function GameplayMedia({
  alt,
  name,
  play,
}: {
  alt: string;
  name: string;
  play: boolean;
}) {
  const poster = `${import.meta.env.BASE_URL}images/onboarding/${name}.jpg`;

  if (!play) {
    return <img src={poster} alt={alt} className="w-full h-full object-cover" />;
  }

  return (
    <video
      autoPlay
      muted
      loop
      playsInline
      poster={poster}
      className="w-full h-full object-cover"
    >
      <source src={`${import.meta.env.BASE_URL}videos/${name}.webm`} type="video/webm" />
    </video>
  );
}
