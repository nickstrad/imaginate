"use client";

import * as React from "react";
import {
  AlertCircle,
  BoxesIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LayoutGridIcon,
  ListIcon,
} from "lucide-react";

import { Card, CardContent } from "@/ui/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/ui/components/ui/pagination";
import { Skeleton } from "@/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/ui/toggle-group";
import { Button } from "@/ui/components/ui/button";
import type { Project } from "@/generated/prisma";

interface ProjectListProps {
  projects: Project[] | undefined;
  isLoading: boolean;
  error: unknown;
  onProjectClick: (projectId: string) => void;
}

const RECENT_PROJECTS_LABEL = "Recent projects";
const GRID_BATCH_SIZE = 10;
const TABLE_PAGE_SIZE = 8;
const PROJECT_CARD_CLASS =
  "cursor-pointer border-chrome-border bg-surface-elevated py-0 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-ring/50 hover:bg-surface hover:shadow-md";

type ProjectViewMode = "grid" | "list";

const projectDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const getTimeAgo = (date: Date) => {
  const now = new Date();
  const diffInMs = now.getTime() - new Date(date).getTime();
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInHours / 24);
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));

  if (diffInMinutes < 60) {
    return diffInMinutes === 1
      ? "about 1 minute ago"
      : `about ${diffInMinutes} minutes ago`;
  }
  if (diffInHours < 24) {
    return diffInHours === 1
      ? "about 1 hour ago"
      : `about ${diffInHours} hours ago`;
  }
  if (diffInDays === 1) {
    return "about 1 day ago";
  }
  if (diffInDays < 30) {
    return `about ${diffInDays} days ago`;
  }
  const diffInMonths = Math.floor(diffInDays / 30);
  return diffInMonths === 1
    ? "about 1 month ago"
    : `about ${diffInMonths} months ago`;
};

const formatProjectDate = (date: Date) =>
  projectDateFormatter.format(new Date(date));

const ProjectSection = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto w-full max-w-3xl">{children}</div>
);

const ProjectIcon = () => (
  <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-chrome-border bg-surface-subtle">
    <BoxesIcon className="size-4 text-muted-foreground" />
  </div>
);

const ProjectSummary = ({
  project,
  showCompactUpdatedAt = false,
}: {
  project: Project;
  showCompactUpdatedAt?: boolean;
}) => (
  <div className="flex min-w-0 items-center gap-3">
    <ProjectIcon />
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium text-foreground">
        {project.name}
      </div>
      {showCompactUpdatedAt && (
        <div className="text-xs text-muted-foreground sm:hidden">
          {getTimeAgo(project.updatedAt)}
        </div>
      )}
    </div>
  </div>
);

const ProjectViewToggle = ({
  viewMode,
  onViewModeChange,
}: {
  viewMode: ProjectViewMode;
  onViewModeChange: (viewMode: ProjectViewMode) => void;
}) => (
  <ToggleGroup
    type="single"
    value={viewMode}
    onValueChange={(value) => {
      if (value === "grid" || value === "list") {
        onViewModeChange(value);
      }
    }}
    variant="outline"
    size="sm"
    aria-label="Project view"
  >
    <ToggleGroupItem value="grid" aria-label="Grid view">
      <LayoutGridIcon className="size-4" />
    </ToggleGroupItem>
    <ToggleGroupItem value="list" aria-label="List view">
      <ListIcon className="size-4" />
    </ToggleGroupItem>
  </ToggleGroup>
);

const ProjectSectionHeader = ({
  viewMode,
  onViewModeChange,
}: {
  viewMode?: ProjectViewMode;
  onViewModeChange?: (viewMode: ProjectViewMode) => void;
}) => (
  <div className="mb-4 flex items-center justify-between gap-3">
    <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
      {RECENT_PROJECTS_LABEL}
    </h2>
    {viewMode && onViewModeChange && (
      <ProjectViewToggle
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
      />
    )}
  </div>
);

const ProjectGridCard = ({
  project,
  onProjectClick,
}: {
  project: Project;
  onProjectClick: (projectId: string) => void;
}) => (
  <Card
    className={PROJECT_CARD_CLASS}
    onClick={() => onProjectClick(project.id)}
  >
    <CardContent className="px-3 py-3">
      <ProjectSummary project={project} />
      <div className="mt-1 pl-11 text-xs text-muted-foreground">
        {getTimeAgo(project.updatedAt)}
      </div>
    </CardContent>
  </Card>
);

const ProjectGrid = ({
  projects,
  onProjectClick,
  onShowMore,
  remainingProjectCount,
}: {
  projects: Project[];
  onProjectClick: (projectId: string) => void;
  onShowMore: () => void;
  remainingProjectCount: number;
}) => {
  const nextProjectCount = Math.min(GRID_BATCH_SIZE, remainingProjectCount);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectGridCard
            key={project.id}
            project={project}
            onProjectClick={onProjectClick}
          />
        ))}
      </div>
      {remainingProjectCount > 0 && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={onShowMore}>
            More projects
            <span className="text-muted-foreground">
              ({nextProjectCount} of {remainingProjectCount})
            </span>
          </Button>
        </div>
      )}
    </div>
  );
};

const openProjectFromKeyboard = (
  event: React.KeyboardEvent<HTMLTableRowElement>,
  projectId: string,
  onProjectClick: (projectId: string) => void
) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onProjectClick(projectId);
  }
};

const ProjectTableRow = ({
  project,
  onProjectClick,
}: {
  project: Project;
  onProjectClick: (projectId: string) => void;
}) => (
  <TableRow
    role="button"
    tabIndex={0}
    className="cursor-pointer"
    onClick={() => onProjectClick(project.id)}
    onKeyDown={(event) =>
      openProjectFromKeyboard(event, project.id, onProjectClick)
    }
  >
    <TableCell className="max-w-0">
      <ProjectSummary project={project} showCompactUpdatedAt />
    </TableCell>
    <TableCell className="hidden text-muted-foreground sm:table-cell">
      {getTimeAgo(project.updatedAt)}
    </TableCell>
    <TableCell className="hidden text-muted-foreground md:table-cell">
      {formatProjectDate(project.createdAt)}
    </TableCell>
  </TableRow>
);

const ProjectTablePagination = ({
  currentPage,
  pageCount,
  onPageChange,
}: {
  currentPage: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) => {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        Page {currentPage + 1} of {pageCount}
      </p>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => onPageChange(currentPage - 1)}
            >
              <ChevronLeftIcon className="size-4" />
              Previous
            </Button>
          </PaginationItem>
          <PaginationItem>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount - 1}
              onClick={() => onPageChange(currentPage + 1)}
            >
              Next
              <ChevronRightIcon className="size-4" />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};

const ProjectTable = ({
  projects,
  page,
  onPageChange,
  onProjectClick,
}: {
  projects: Project[];
  page: number;
  onPageChange: (page: number) => void;
  onProjectClick: (projectId: string) => void;
}) => {
  const pageCount = Math.max(Math.ceil(projects.length / TABLE_PAGE_SIZE), 1);
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * TABLE_PAGE_SIZE;
  const pageProjects = projects.slice(pageStart, pageStart + TABLE_PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-chrome-border bg-surface-elevated shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Updated</TableHead>
              <TableHead className="hidden md:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageProjects.map((project) => (
              <ProjectTableRow
                key={project.id}
                project={project}
                onProjectClick={onProjectClick}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <ProjectTablePagination
        currentPage={currentPage}
        pageCount={pageCount}
        onPageChange={onPageChange}
      />
    </div>
  );
};

export const ProjectList = ({
  projects,
  isLoading,
  error,
  onProjectClick,
}: ProjectListProps) => {
  const [viewMode, setViewMode] = React.useState<ProjectViewMode>("list");
  const [visibleGridProjectCount, setVisibleGridProjectCount] =
    React.useState(GRID_BATCH_SIZE);
  const [listPage, setListPage] = React.useState(0);
  const setProjectViewMode = (nextViewMode: ProjectViewMode) => {
    setViewMode(nextViewMode);
    setListPage(0);
  };
  const showMoreGridProjects = () => {
    setVisibleGridProjectCount((current) =>
      Math.min(current + GRID_BATCH_SIZE, projects?.length ?? current)
    );
  };

  if (isLoading) {
    return (
      <ProjectSection>
        <ProjectSectionHeader />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </ProjectSection>
    );
  }

  if (error) {
    return (
      <ProjectSection>
        <ProjectSectionHeader />
        <div className="flex items-center justify-center rounded-lg border border-chrome-border bg-surface-elevated p-8 shadow-sm">
          <div className="text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                Failed to Load Projects
              </h3>
              <p className="text-sm text-muted-foreground">
                There was an error loading your projects. Please try again.
              </p>
            </div>
          </div>
        </div>
      </ProjectSection>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <ProjectSection>
        <p className="text-sm text-muted-foreground text-center">
          Your first build will appear here.
        </p>
      </ProjectSection>
    );
  }

  const gridProjects = projects.slice(0, visibleGridProjectCount);
  const remainingGridProjectCount = Math.max(
    projects.length - gridProjects.length,
    0
  );

  return (
    <ProjectSection>
      <ProjectSectionHeader
        viewMode={viewMode}
        onViewModeChange={setProjectViewMode}
      />
      {viewMode === "grid" ? (
        <ProjectGrid
          projects={gridProjects}
          onProjectClick={onProjectClick}
          onShowMore={showMoreGridProjects}
          remainingProjectCount={remainingGridProjectCount}
        />
      ) : (
        <ProjectTable
          projects={projects}
          page={listPage}
          onPageChange={setListPage}
          onProjectClick={onProjectClick}
        />
      )}
    </ProjectSection>
  );
};
