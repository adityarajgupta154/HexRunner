import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { StoreButtons } from './StoreButtons';

export function Hero({ onStoreClick }: { onStoreClick: () => void }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.1]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <div ref={ref} className="relative h-screen w-full overflow-hidden bg-[#030712] flex items-center justify-center sticky top-0 z-0">
      <motion.div 
        style={{ y, scale, opacity }}
        className="absolute inset-0 w-full h-full"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#030712]/60 to-[#030712] z-10" />
        <img 
          src={`${import.meta.env.BASE_URL}images/earth-night.png`}
          alt="Night City Grid"
          className="w-full h-full object-cover object-center opacity-60 mix-blend-screen"
        />
        <div className="noise-overlay absolute inset-0 opacity-20 z-20 pointer-events-none" />
      </motion.div>

      <motion.div 
        style={{ opacity, scale: useTransform(scrollYProgress, [0, 1], [1, 0.9]) }}
        className="relative z-30 flex flex-col items-center text-center px-4 max-w-5xl"
      >
        <h1 className="text-6xl md:text-8xl lg:text-9xl font-black uppercase tracking-tighter leading-[0.85] mb-8 drop-shadow-2xl">
          CLAIM YOUR<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">TERRITORY</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-zinc-300 mb-12 max-w-3xl font-medium leading-tight">
          GPS running turns real streets into claimable hex territory. Close loops, capture grids, and defend your city in the ultimate nocturnal running game.
        </p>

        <StoreButtons onClick={onStoreClick} />
      </motion.div>
    </div>
  );
}
