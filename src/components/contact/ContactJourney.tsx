import { Check, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Stage } from "../../types";
import { useLanguage } from "../LanguageProvider";

export default function ContactJourney({
  stages,
  stageIdx,
  canMoveStage,
  onMoveStage,
}: {
  stages: Stage[];
  stageIdx: number;
  canMoveStage: boolean;
  onMoveStage: (label: string) => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="cd-sec">
      <div className="cd-sec-head">
        <h3 className="cd-sec-title">{t('modals.contactDetails.where_they_are')}</h3>
      </div>
      <div className="cd-journey">
        {stages.length === 0 && (
          <span className="text-xs text-on-surface-variant">{t('modals.contactDetails.no_steps')}</span>
        )}
        {stages.map((s, i) => {
          const state = stageIdx === -1 ? "" : i < stageIdx ? "done" : i === stageIdx ? "on" : "";
          const body = (
            <>
              <span className="cd-step-mark">
                {state === "on" && <Check className="w-2.5 h-2.5 text-white" />}
                {state === "done" && <span className="pd" />}
              </span>
              <span className="cd-step-name">{s.label}</span>
              {state === "on" && <span className="cd-step-here">{t('modals.contactDetails.here_now')}</span>}
            </>
          );
          // The step list is where the pipeline is already
          // explained, so it doubles as the move target
          // for anyone who may edit (#677).
          return canMoveStage && state !== "on" ? (
            <button
              key={s.id}
              onClick={() => onMoveStage(s.label)}
              className={cn("cd-journey-step is-move", state)}
            >
              {body}
              <span className="cd-step-move">
                {t('modals.contactDetails.move_here')}
                <ChevronRight className="w-3 h-3" />
              </span>
            </button>
          ) : (
            <div key={s.id} className={cn("cd-journey-step", state)}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
