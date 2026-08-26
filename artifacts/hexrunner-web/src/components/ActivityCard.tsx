import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

export function ActivityCard() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });

  const mapY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const phoneY = useTransform(scrollYProgress, [0, 1], ["15%", "-15%"]);

  return (
    <div ref={ref} className="relative w-full bg-zinc-50 rounded-t-[3rem] py-32 md:py-48 px-6 z-40 overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
      {/* Map Texture Background */}
      <motion.div style={{ y: mapY }} className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <img src={`${import.meta.env.BASE_URL}images/earth-night.png`} alt="Texture" className="w-full h-full object-cover grayscale invert scale-150" />
      </motion.div>

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16 lg:gap-24 relative z-10">
        <div className="flex-1 text-center lg:text-left">
          <h2 className="text-5xl md:text-7xl font-black text-zinc-900 uppercase tracking-tighter mb-8 leading-[0.9]">
            Run or Ride,<br/>
            <span className="text-primary">Move Your Way.</span>
          </h2>
          <p className="text-xl md:text-2xl text-zinc-600 font-medium leading-relaxed max-w-2xl mx-auto lg:mx-0">
            One game, two ways to play it. Runs and rides each have their own territory game, so every battle is fair. Runners compete with runners, riders with riders. Switch your activity type whenever you like.
          </p>
          <div className="mt-12 flex flex-wrap gap-4 justify-center lg:justify-start">
            {['Safety Signals', 'Air Quality', 'Civic Reports'].map(tag => (
              <span key={tag} className="px-5 py-2.5 bg-zinc-200 text-zinc-800 rounded-full text-xs font-bold uppercase tracking-widest shadow-sm">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 w-full max-w-md relative flex justify-center">
          <motion.div style={{ y: phoneY }} className="relative aspect-[1/2.1] w-full max-w-[340px] rounded-[3rem] border-[14px] border-zinc-200 bg-white overflow-hidden shadow-2xl">
            <div className="absolute top-0 inset-x-0 h-7 bg-zinc-200 rounded-b-3xl w-40 mx-auto z-50" />
            
            {/* Light UI */}
            <div className="absolute inset-0 bg-zinc-50 flex flex-col pt-16 p-5">
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-5 mb-5">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xl">
                    M
                  </div>
                  <div>
                    <div className="font-bold text-zinc-900 text-lg">Morning Loop</div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mt-1">5.2km • 28 Hexes</div>
                  </div>
                </div>
                <div className="h-40 bg-zinc-100 rounded-xl overflow-hidden relative">
                   <img src={`${import.meta.env.BASE_URL}images/earth-night.png`} className="w-full h-full object-cover opacity-20 grayscale invert scale-150" alt="map" />
                   <div className="absolute inset-0 flex items-center justify-center bg-zinc-100/50">
                     <svg viewBox="0 0 100 100" className="w-20 h-20 text-primary drop-shadow-md" fill="currentColor">
                       <path d="M50 0 L93.3 25 L93.3 75 L50 100 L6.7 75 L6.7 25 Z" opacity="0.9" />
                     </svg>
                   </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="h-20 bg-white rounded-2xl shadow-sm border border-zinc-100 flex items-center p-5">
                  <div className="w-2 h-full bg-primary rounded-full mr-5" />
                  <div className="flex-1">
                    <div className="font-bold text-zinc-900 text-base">Nearby Runner</div>
                    <div className="text-xs text-zinc-500 font-medium mt-1">2 blocks away</div>
                  </div>
                </div>
                <div className="h-20 bg-white rounded-2xl shadow-sm border border-zinc-100 flex items-center p-5">
                  <div className="w-2 h-full bg-cyan-400 rounded-full mr-5" />
                  <div className="flex-1">
                    <div className="font-bold text-zinc-900 text-base">Air Quality</div>
                    <div className="text-xs text-zinc-500 font-medium mt-1">Good • 42 AQI</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
