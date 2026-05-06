import Navbar from "@/features/projects/presentation/home/components/navbar";

interface Props {
  children: React.ReactNode;
}

const Layout: React.FC<Props> = ({ children }) => {
  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="sticky top-0 z-10">
        <Navbar />
      </header>
      <main className="flex-1 overflow-y-auto bg-[radial-gradient(circle,var(--grid-dot)_1px,transparent_1px)] bg-[size:22px_22px]">
        {children}
      </main>
    </div>
  );
};

export default Layout;
