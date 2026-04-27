"use client";

import { MessagesContainer } from "@/features/messages/presentation/containers/messages-container";
import ProjectViewFrame from "../views/project-view";

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
