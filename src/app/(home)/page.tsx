import { ProjectForm } from "@/features/projects/presentation/home/containers/project-form";
import { ProjectList } from "@/features/projects/presentation/home/containers/project-list";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto w-full max-w-5xl">
        <section className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Product studio
          </p>
          <h1 className="mb-5 text-6xl font-semibold tracking-normal text-foreground sm:text-7xl">
            Imaginate
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">
            Start with the rough version in your head. Imaginate turns it into a
            live project you can inspect, revise, and keep building.
          </p>
        </section>

        <div className="space-y-7">
          <ProjectForm />
          <ProjectList />
        </div>
      </div>
    </div>
  );
}
