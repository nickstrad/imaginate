"use client";

import ProjectViewFrame from "@/features/projects/presentation/project/views/project-view";
import { MessagesContainer } from "./messages-container";

interface ProjectViewProps {
  projectId: string;
}

export default function ProjectView({ projectId }: ProjectViewProps) {
  return (
    <ProjectViewFrame
      renderMessages={({ activeFragment, setActiveFragment }) => (
        <MessagesContainer
          projectId={projectId}
          activeFragment={activeFragment}
          setActiveFragment={setActiveFragment}
        />
      )}
    />
  );
}
