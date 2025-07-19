export const PROJECT_TEMPLATES = [
  {
    emoji: "🎬",
    title: "Build a Netflix clone",
    prompt:
      "Build a Netflix-style homepage with a hero banner (use a nice, dark-mode compatible gradient here), movie sections, responsive cards, and a modal for viewing details using mock data and local state. Use dark mode.",
  },
  {
    emoji: "📦",
    title: "Build an admin dashboard",
    prompt:
      "Create an admin dashboard with a sidebar, stat cards, a chart placeholder, and a basic table with filter and pagination using local state. Use clear visual grouping and balance in your design for a modern, professional look.",
  },
  {
    emoji: "📋",
    title: "Build a kanban board",
    prompt:
      "Build a kanban board with drag-and-drop using react-beautiful-dnd and support for adding and removing tasks with local state. Use consistent spacing, column widths, and hover effects for a polished UI.",
  },
  {
    emoji: "🗂️",
    title: "Build a file manager",
    prompt:
      "Build a file manager with folder list, file grid, and options to rename or delete items using mock data and local state. Focus on spacing, clear icons, and visual distinction between folders and files.",
  },
  {
    emoji: "📺",
    title: "Build a YouTube clone",
    prompt:
      "Build a YouTube-style homepage with mock video thumbnails, a category sidebar, and a modal preview with title and description using local state. Ensure clean alignment and a well-organized grid layout.",
  },
  {
    emoji: "🛍️",
    title: "Build a store page",
    prompt:
      "Build a store page with category filters, a product grid, and local cart logic to add and remove items. Focus on clear typography, spacing, and button states for a great e-commerce UI.",
  },
  {
    emoji: "🏡",
    title: "Build an Airbnb clone",
    prompt:
      "Build an Airbnb-style listings grid with mock data, filter sidebar, and a modal with property details using local state. Use card spacing, soft shadows, and clean layout for a welcoming design.",
  },
  {
    emoji: "🎵",
    title: "Build a Spotify clone",
    prompt:
      "Build a Spotify-style music player with a sidebar for playlists, a main area for song details, and playback controls. Use local state for managing playback and song selection. Prioritize layout balance and intuitive control placement for a smooth user experience. Use dark mode.",
  },
] as const;

import { Card, CardContent } from "@/components/ui/card";

interface ProjectTemplatesProps {
  onTemplateSelect: (prompt: string) => void;
}

export const ProjectTemplates = ({
  onTemplateSelect,
}: ProjectTemplatesProps) => {
  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-2 justify-center">
        {PROJECT_TEMPLATES.map((template, index) => (
          <Card
            key={index}
            className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 border-2 border-border hover:border-primary/50 w-fit py-0"
            onClick={() => onTemplateSelect(template.prompt)}
          >
            <CardContent className="px-3 py-1">
              <h4 className="font-medium text-foreground text-sm leading-tight flex items-center gap-2 whitespace-nowrap">
                <span className="text-lg">{template.emoji}</span>
                {template.title}
              </h4>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
