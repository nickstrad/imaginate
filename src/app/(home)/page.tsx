import { ProjectForm } from "@/features/projects/presentation/home/containers/project-form";
import { ProjectList } from "@/features/projects/presentation/home/containers/project-list";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="mx-auto w-full max-w-4xl text-center">
        <h1 className="mb-5 text-6xl font-semibold tracking-normal text-foreground sm:text-7xl">
          Imaginate
        </h1>
        <p className="mx-auto mb-12 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          Simply type a prompt and watch your ideas come to life as live,
          interactive web applications. No coding experience required.
        </p>

        <div className="space-y-7">
          <ProjectForm />
          <ProjectList />
        </div>
      </div>
    </div>
  );
}
