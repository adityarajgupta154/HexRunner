import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useRef } from 'react';

const features = [
  {
    title: "Track Your Performance",
    desc: "Every stat recorded, analyzed, and mapped. Your pace, your blocks, your progress over time."
  },
  {
    title: "Local Battles",
    desc: "Take territory from another player in a head-to-head battle mode. Push your limit or lose your ground."
  },
  {
    title: "Seasonal Prizes",
    desc: "The territory you hold earns outside game rewards. The more ground you keep, the better your chances."
  }
];

export function FeatureCards() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"]
  });

  return (
    <div ref={ref} className="relative h-[300vh] w-full bg-[#030712] z-30">
      <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
        {/* Background Footage */}
        <div className="absolute inset-0 z-0 bg-[#030712]">
          <img 
            src={`${import.meta.env.BASE_URL}images/urban-runner.jpg`}
            alt="Runner"
            className="w-full h-full object-cover opacity-20 mix-blend-luminosity"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#030712]/90" />
        </div>

        <div className="relative z-10 w-full max-w-6xl px-4 text-center">
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-black text-white uppercase tracking-tighter mb-16 md:mb-24 leading-[0.9]">
            Master the Game<br/>
            <span className="text-primary">With Battles and Prizes.</span>
          </h2>
          
          <div className="relative w-full max-w-5xl mx-auto h-[450px] flex justify-center items-center">
            {features.map((feature, index) => (
              <FeatureCard
                feature={feature}
                index={index}
                key={feature.title}
                progress={scrollYProgress}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  feature,
  index,
  progress,
}: {
  feature: (typeof features)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  const centerPoint = (index * 0.33) + 0.165;
  const wideRange = [
    Math.max(0, centerPoint - 0.3),
    centerPoint,
    Math.min(1, centerPoint + 0.3),
  ];
  const tightRange = [
    Math.max(0, centerPoint - 0.2),
    centerPoint,
    Math.min(1, centerPoint + 0.2),
  ];
  const x = useTransform(
    progress,
    wideRange,
    [
      index < 1 ? 150 : index > 1 ? -150 : 0,
      0,
      index < 1 ? -150 : index > 1 ? 150 : 0,
    ],
  );
  const scale = useTransform(progress, tightRange, [0.85, 1.05, 0.85]);
  const opacity = useTransform(progress, tightRange, [0.3, 1, 0.3]);
  const rotateY = useTransform(
    progress,
    tightRange,
    [
      index < 1 ? -10 : index > 1 ? 10 : 0,
      0,
      index < 1 ? 10 : index > 1 ? -10 : 0,
    ],
  );

  return (
    <motion.div
      style={{
        x,
        scale,
        opacity,
        rotateY,
        zIndex: index === 1 ? 5 : 1,
      }}
      className="absolute bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-[2rem] p-10 w-[300px] md:w-[360px] h-[360px] shadow-2xl origin-center flex flex-col justify-between"
    >
      <div>
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-8 border border-primary/20">
          <div className="w-5 h-5 bg-primary rounded-sm rotate-45 shadow-[0_0_15px_rgba(0,230,118,0.5)]" />
        </div>
        <h3 className="text-3xl font-black text-white uppercase tracking-tight mb-4 leading-[1.1]">{feature.title}</h3>
        <p className="text-zinc-400 font-medium text-base leading-relaxed">{feature.desc}</p>
      </div>
    </motion.div>
  );
}
