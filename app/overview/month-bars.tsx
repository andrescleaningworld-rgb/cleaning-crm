"use client";

// One plain bar chart for the Overview: one bar per month, the number written
// on each bar (nothing is hover-only), big month names under them, and one
// sentence under the chart that says what it means (lib/overviewHealth.ts
// chartCaption). One series, so no legend: the title names it.

import { chartCaption } from "@/lib/overviewHealth";
import styles from "./overview.module.css";

export type MonthValue = { label: string; value: number };

export default function MonthBars({ title, months, noun }: { title: string; months: MonthValue[]; noun: string }) {
  const max = Math.max(1, ...months.map((month) => month.value));
  const caption = chartCaption(months, noun);
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>{title}</figcaption>
      <div role="img" aria-label={`${title}. ${months.map((m) => `${m.label}: ${m.value}`).join(", ")}. ${caption}`}>
        <div className={styles.bars} aria-hidden="true">
          {months.map((month, index) => (
            <div key={month.label} className={styles.barCol}>
              <span className={styles.barValue}>{month.value.toLocaleString("en-US")}</span>
              <span
                className={`${styles.bar} ${index === months.length - 1 ? styles.barNow : ""}`.trim()}
                style={{ height: `${month.value > 0 ? Math.max(3, Math.round((month.value / max) * 82)) : 0}%` }}
              />
            </div>
          ))}
        </div>
        <div className={styles.barLabels} aria-hidden="true">
          {months.map((month) => (
            <span key={month.label}>{month.label}</span>
          ))}
        </div>
      </div>
      <p className={styles.chartCaption}>{caption}</p>
      <p className={styles.chartNote}>The striped bar is this month, so far.</p>
    </figure>
  );
}
