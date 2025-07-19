import { ProjectForm } from "@/modules/home/ui/components/project-form";
import { ProjectList } from "@/modules/home/ui/components/project-list";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 bg-white dark:bg-gray-900">
      <div className="text-center max-w-4xl mx-auto">
        <h1 className="text-6xl font-bold text-gray-900 dark:text-gray-100 mb-6">
          Imaginate
        </h1>
        <p className="text-lg text-gray-500 dark:text-gray-400 mb-12 max-w-2xl mx-auto">
          Simply type a prompt and watch your ideas come to life as live,
          interactive web applications. No coding experience required.
        </p>

        <div className="space-y-6">
          <ProjectForm />
          <ProjectList />
        </div>
      </div>
    </div>
  );
}
