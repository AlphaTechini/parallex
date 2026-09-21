import type { BotTemplate } from "@/components/templates/types";
import styles from "@/components/templates/templates.module.css";

const AUDIENCE_LABELS = {
  everyday: "Everyday",
  software: "Software",
  ai: "AI",
  hardware: "Hardware",
} as const;

export function TemplateCard({
  template,
  onOpen,
}: {
  template: BotTemplate;
  onOpen: () => void;
}) {
  return (
    <button className={styles.templateCard} onClick={onOpen} type="button">
      <span className={styles.cardIndex}>
        {template.name
          .split(" ")
          .slice(0, 2)
          .map((part) => part[0])
          .join("")}
      </span>
      <span className={styles.cardContent}>
        <span className={styles.tagRow}>
          {template.audiences.map((audience) => (
            <span className={styles.tag} key={audience}>
              {AUDIENCE_LABELS[audience]}
            </span>
          ))}
          {template.schedules.length > 0 ? (
            <span className={styles.scheduleTag}>Scheduled</span>
          ) : null}
        </span>
        <strong>{template.name}</strong>
        <span className={styles.cardDescription}>{template.shortDescription}</span>
        <span className={styles.cardOutcome}>{template.outcome}</span>
      </span>
      <span aria-hidden="true" className={styles.cardArrow}>
        View
      </span>
    </button>
  );
}
