const METRICS = [
  { label: "Beam intensity", value: "88%" },
  { label: "Color ignition", value: "3 layers" },
  { label: "Flow vectors", value: "4 paths" },
];

export default function MotionDemoPage() {
  return (
    <div className="space-y-8 py-10">
      <section className="rounded-[32px] border border-white/10 bg-background/20 px-8 py-10 backdrop-blur-sm">
        <div className="max-w-3xl space-y-5">
          <p className="text-xs tracking-[0.32em] text-muted-foreground uppercase">
            Motion sandbox
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Background ignition demo
          </h1>
          <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
            This route exists only to evaluate the landing beam and the endless flow field
            without backend requests, task polling, or analysis list fetches.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {METRICS.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[28px] border border-white/10 bg-background/18 p-6 backdrop-blur-sm"
          >
            <p className="text-sm text-muted-foreground">{metric.label}</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">{metric.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[32px] border border-white/10 bg-background/16 p-8 backdrop-blur-sm">
        <div className="max-w-2xl space-y-3">
          <h2 className="text-2xl font-semibold text-foreground">What to inspect</h2>
          <p className="text-sm leading-7 text-muted-foreground">
            The video should collapse away once, the beam should visibly ignite the color field,
            and the background should keep drifting without obvious loop seams or left-right
            pendulum motion.
          </p>
        </div>
      </section>
    </div>
  );
}
