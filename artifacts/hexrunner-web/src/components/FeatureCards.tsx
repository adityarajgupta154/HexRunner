import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useRef } from 'react';
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion';

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
  const reduceMotion = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"]
  });

  return (
    <div ref={ref} className="relative h-auto md:h-[300vh] w-full z-50 rounded-t-[3rem] md:rounded-none shadow-[0_-20px_50px_rgba(0,0,0,0.5)] md:shadow-none bg-[#030712] md:bg-transparent">
      <div className="relative md:sticky md:top-0 h-auto md:h-screen w-full flex items-center justify-center overflow-hidden py-24 md:py-0 md:rounded-t-[3rem] md:shadow-[0_-20px_50px_rgba(0,0,0,0.5)] md:bg-[#030712]">
        {/* Background Footage */}
        <div className="absolute inset-0 z-0 bg-[#030712]">
          {reduceMotion ? (
            <img
              src={`${import.meta.env.BASE_URL}images/onboarding/grow-territory-v2.jpg`}
              alt=""
              className="w-full h-full object-cover opacity-20 mix-blend-luminosity"
            />
          ) : (
            <video
              autoPlay
              muted
              loop
              playsInline
              poster={`${import.meta.env.BASE_URL}images/onboarding/grow-territory-v2.jpg`}
              className="w-full h-full object-cover opacity-20 mix-blend-luminosity"
            >
              <source src={`${import.meta.env.BASE_URL}videos/grow-territory-v2.webm`} type="video/webm" />
            </video>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#030712]/90" />
        </div>

        <div className="relative z-10 w-full max-w-6xl px-4 text-center">
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-black text-white uppercase tracking-tighter mb-16 md:mb-24 leading-[0.9]">
            Master the Game<br/>
            <span className="text-primary">With Battles and Prizes.</span>
          </h2>
          
          <div className="relative w-full max-w-5xl mx-auto md:h-[450px] flex flex-col md:flex-row justify-center items-center gap-6 md:gap-0">
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
  const xOutputs = [
    [0, -280, -420],
    [280, 0, -280],
    [420, 280, 0],
  ][index];
  const x = useTransform(progress, [0, 0.5, 1], xOutputs);
  const scale = useTransform(
    progress,
    index === 0 ? [0, 0.34] : index === 1 ? [0, 0.5, 1] : [0.66, 1],
    index === 0 ? [1.05, 0.85] : index === 1 ? [0.85, 1.05, 0.85] : [0.85, 1.05],
  );
  const opacity = useTransform(
    progress,
    index === 0 ? [0, 0.34] : index === 1 ? [0, 0.5, 1] : [0.66, 1],
    index === 0 ? [1, 0.35] : index === 1 ? [0.35, 1, 0.35] : [0.35, 1],
  );
  const zIndexRaw = useTransform(
    progress,
    index === 0 ? [0, 0.34] : index === 1 ? [0, 0.5, 1] : [0.66, 1],
    index === 0 ? [10, 1] : index === 1 ? [1, 10, 1] : [1, 10],
  );
  const zIndex = useTransform(zIndexRaw, Math.round);
  const rotateY = useTransform(
    progress,
    index === 0 ? [0, 0.34] : index === 1 ? [0, 0.5, 1] : [0.66, 1],
    index === 0 ? [0, -10] : index === 1 ? [10, 0, -10] : [10, 0],
  );

  return (
    <>
      <div className="relative w-full min-h-[320px] mb-6 md:hidden">
        <FeatureCardContent feature={feature} />
      </div>
      <motion.div
        style={{ x, scale, opacity, zIndex, rotateY }}
        className="hidden md:block absolute w-[360px] h-[360px]"
      >
        <FeatureCardContent feature={feature} />
      </motion.div>
    </>
  );
}

function FeatureCardContent({
  feature,
}: {
  feature: (typeof features)[number];
}) {
  return (
    <div className="bg-zinc-950/90 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 md:p-10 w-full h-full shadow-2xl origin-center flex flex-col justify-between">
      <div>
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-8 border border-primary/20">
          <div className="w-5 h-5 bg-primary rounded-sm rotate-45 shadow-[0_0_15px_rgba(0,230,118,0.5)]" />
        </div>
        <h3 className="text-3xl font-black text-white uppercase tracking-tight mb-4 leading-[1.1]">{feature.title}</h3>
        <p className="text-zinc-400 font-medium text-base leading-relaxed">{feature.desc}</p>
      </div>
    </div>
  );
}
