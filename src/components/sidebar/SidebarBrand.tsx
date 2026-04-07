import EktaLogo from "@/components/common/EktaLogo";

const SidebarBrand = () => {
  return (
    <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
      <EktaLogo className="scale-75 origin-left" />
    </div>
  );
};

export default SidebarBrand;
