import { StoreButtons } from './StoreButtons';
import { motion } from 'framer-motion';

export function EndState({ onStoreClick }: { onStoreClick: () => void }) {
  return (
    <div className="relative min-h-screen w-full bg-primary flex flex-col items-center justify-center p-6 z-70 rounded-t-[3rem] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
      
      {/* Background graphic */}
      <div className="absolute inset-0 opacity-[0.08] pointer-events-none flex items-center justify-center mix-blend-color-burn">
        <img 
          src={`${import.meta.env.BASE_URL}images/hexrunner-mark.png`} 
          alt="" 
          className="w-[150vw] md:w-[120vw] max-w-none rotate-12 scale-150" 
        />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center w-full max-w-5xl">
        <motion.h2 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className="text-7xl md:text-9xl lg:text-[12rem] font-black text-[#030712] uppercase tracking-tighter leading-[0.8] mb-16"
        >
          START YOUR<br/>CONQUEST
        </motion.h2>
        
        <StoreButtons onClick={onStoreClick} light />
      </div>

      <div className="absolute bottom-8 md:bottom-12 inset-x-0 text-center px-6 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 text-[#030712]/60 font-bold text-sm uppercase tracking-widest">
        <span>© {new Date().getFullYear()} HexRunner</span>
        <span className="hidden md:inline text-[#030712]/30">•</span>
        <a href="#" className="hover:text-[#030712] transition-colors">Privacy Policy</a>
        <span className="hidden md:inline text-[#030712]/30">•</span>
        <a href="#" className="hover:text-[#030712] transition-colors">Terms of Service</a>
      </div>
    </div>
  );
}
