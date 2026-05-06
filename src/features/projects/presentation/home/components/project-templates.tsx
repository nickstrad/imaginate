import {
  Columns3Icon,
  FilmIcon,
  FolderTreeIcon,
  HomeIcon,
  LayoutDashboardIcon,
  Music2Icon,
  ShoppingBagIcon,
  TvIcon,
} from "lucide-react";

import { Card, CardContent } from "@/ui/components/ui/card";

export const PROJECT_TEMPLATES = [
  {
    icon: FilmIcon,
    title: "Streaming catalog",
    prompt:
      "Design a premium streaming catalog for independent films with a cinematic hero, editorial rows, saved picks, and a detail drawer that feels polished in dark mode.",
  },
  {
    icon: LayoutDashboardIcon,
    title: "Ops dashboard",
    prompt:
      "Create a compact operations dashboard for a support team with priority queues, trend cards, a dense activity table, and clear empty/loading states.",
  },
  {
    icon: Columns3Icon,
    title: "Launch board",
    prompt:
      "Build a launch-planning board with draggable workstreams, release-risk labels, owner avatars, and a focused task inspector panel.",
  },
  {
    icon: FolderTreeIcon,
    title: "Asset library",
    prompt:
      "Create a design asset library with folder navigation, metadata-rich file cards, search filters, rename/delete actions, and a preview drawer.",
  },
  {
    icon: TvIcon,
    title: "Creator hub",
    prompt:
      "Build a creator analytics hub with video cards, channel health metrics, an upload queue, and a clean modal for reviewing performance details.",
  },
  {
    icon: ShoppingBagIcon,
    title: "Boutique store",
    prompt:
      "Design a boutique storefront with refined product cards, category filters, cart state, and a checkout summary that feels elegant and practical.",
  },
  {
    icon: HomeIcon,
    title: "Stay finder",
    prompt:
      "Build a stay-finder interface with map-inspired listing cards, thoughtful filters, saved homes, and a booking detail modal with crisp hierarchy.",
  },
  {
    icon: Music2Icon,
    title: "Listening room",
    prompt:
      "Create a dark-mode music workspace with playlist navigation, current track context, queue management, and tactile playback controls.",
  },
] as const;

interface ProjectTemplatesProps {
  onTemplateSelect: (prompt: string) => void;
}

const ProjectTemplateCard = ({
  template,
  onSelect,
}: {
  template: (typeof PROJECT_TEMPLATES)[number];
  onSelect: (prompt: string) => void;
}) => {
  const TemplateIcon = template.icon;

  return (
    <Card
      className="w-fit cursor-pointer border-chrome-border bg-surface-elevated py-0 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-ring/50 hover:bg-surface hover:shadow-md"
      onClick={() => onSelect(template.prompt)}
    >
      <CardContent className="px-3 py-1.5">
        <h4 className="flex items-center gap-2 whitespace-nowrap text-sm font-medium leading-tight text-foreground">
          <TemplateIcon className="size-3.5 text-muted-foreground" />
          {template.title}
        </h4>
      </CardContent>
    </Card>
  );
};

export const ProjectTemplates = ({
  onTemplateSelect,
}: ProjectTemplatesProps) => {
  return (
    <div className="mt-6">
      <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
        {PROJECT_TEMPLATES.map((template) => (
          <ProjectTemplateCard
            key={template.title}
            template={template}
            onSelect={onTemplateSelect}
          />
        ))}
      </div>
    </div>
  );
};
