import React, { useState } from 'react';
import { Sparkles, Brain, Target, Zap, ChevronRight, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { aiService, CampaignStrategy } from '../../services/aiService';
import { Contact } from '../../types';
import { cn } from '../../lib/utils';

interface AICampaignStrategyProps {
  contacts: Contact[];
  recentActivities: any[];
}

export default function AICampaignStrategy({ contacts, recentActivities }: AICampaignStrategyProps) {
  const [strategy, setStrategy] = useState<CampaignStrategy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateStrategy = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await aiService.generateCampaignStrategy(contacts, recentActivities);
      setStrategy(result);
    } catch (err) {
      console.error(err);
      setError('Failed to generate strategy. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return 'text-error bg-error/10';
      case 'medium': return 'text-warning bg-warning/10';
      case 'low': return 'text-success bg-success/10';
    }
  };

  return (
    <div className="bg-surface-container rounded-[32px] p-6 border border-outline-variant/30 shadow-sm overflow-hidden relative group">
      {/* Background Glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-colors duration-700" />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-on-surface">AI Campaign Strategy</h3>
              <p className="text-xs text-on-surface-variant font-medium">Smart insights based on your community pulse</p>
            </div>
          </div>
          
          {(strategy || error) && (
            <button 
              onClick={generateStrategy}
              disabled={loading}
              className="p-2 rounded-full hover:bg-surface-container-highest transition-colors text-on-surface-variant disabled:opacity-50"
              title="Regenerate"
            >
              <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {!strategy && !loading && !error && (
            <motion.div 
              key="initial"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="py-12 text-center"
            >
              <div className="w-20 h-20 bg-surface-container-highest rounded-full flex items-center justify-center mx-auto mb-6 relative">
                <Brain className="w-10 h-10 text-primary/40" />
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 4, repeat: Infinity }}
                  className="absolute inset-0 bg-primary/20 rounded-full"
                />
              </div>
              <h4 className="text-lg font-bold text-on-surface mb-2">Ready to optimize?</h4>
              <p className="text-sm text-on-surface-variant max-w-xs mx-auto mb-8">
                Generate a custom outreach and growth strategy powered by AI analysis of your community data.
              </p>
              <button
                onClick={generateStrategy}
                className="h-12 px-8 bg-primary text-on-primary rounded-full font-bold shadow-xl shadow-primary/30 hover:shadow-2xl hover:scale-105 transition-all flex items-center gap-2 mx-auto active:scale-95"
              >
                <Zap className="w-4 h-4" />
                Generate AI Strategy
              </button>
            </motion.div>
          )}

          {loading && (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-16 text-center"
            >
              <div className="flex flex-col items-center gap-6">
                <div className="relative w-16 h-16">
                  <Loader2 className="w-16 h-16 text-primary animate-spin" />
                  <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
                </div>
                <div className="space-y-2">
                  <p className="text-on-surface font-bold animate-pulse">Analyzing community health...</p>
                  <p className="text-xs text-on-surface-variant">Scanning {contacts.length} contacts across {Object.keys(contacts.reduce((acc: any, c) => ({...acc, [c.stage]: 1}), {})).length} stages</p>
                </div>
              </div>
            </motion.div>
          )}

          {error && (
            <motion.div 
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center"
            >
              <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <p className="text-on-surface font-bold mb-4">{error}</p>
              <button
                onClick={generateStrategy}
                className="text-primary font-bold hover:underline"
              >
                Try Again
              </button>
            </motion.div>
          )}

          {strategy && !loading && (
            <motion.div 
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Assessment Card */}
              <div className="bg-surface-container-highest/50 rounded-2xl p-5 border border-outline-variant/30 relative overflow-hidden ring-1 ring-white/5">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-on-surface-variant uppercase tracking-widest mb-2">Overall Assessment</h4>
                    <p className="text-on-surface leading-relaxed">{strategy.overallAssessment}</p>
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">Recommended Focus:</span>
                      <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-bold ring-1 ring-primary/20">{strategy.suggestedFocus}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pillars Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {strategy.pillars.map((pillar, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="bg-surface rounded-2xl p-5 border border-outline-variant/50 flex flex-col justify-between group hover:shadow-lg transition-all hover:-translate-y-1"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                          getPriorityColor(pillar.priority)
                        )}>
                          {pillar.priority} priority
                        </span>
                        <Target className="w-4 h-4 text-on-surface-variant opacity-20" />
                      </div>
                      <h5 className="font-bold text-on-surface group-hover:text-primary transition-colors mb-2">{pillar.title}</h5>
                      <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-3 mb-4">{pillar.description}</p>
                    </div>
                    
                    <div className="space-y-2 mt-auto">
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1 opacity-60">
                        Target: {pillar.targetStage}
                      </div>
                      <div className="space-y-1.5">
                        {pillar.actionableTips.slice(0, 2).map((tip, i) => (
                          <div key={i} className="flex gap-2 items-start text-xs text-on-surface group-hover:text-on-surface/90">
                            <Zap className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                            <span>{tip}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
