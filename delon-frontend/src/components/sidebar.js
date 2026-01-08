import React, { useEffect, useState } from "react";
import { ReactComponent as Logo } from "../images/logo.svg";
import { fetchData } from "../lib/api";
import { Spotlight } from "./ui/spotlight";
import { Toaster } from "react-hot-toast";
import Info from "./info";
import { Modal, Backdrop, Box } from '@mui/material';
import Fade from "@mui/material/Fade";
import { Menu, X } from 'lucide-react';

const style = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "52%",
  height: "87%",
  overflowY: "auto",
  bgcolor: "bg-[#060a1b] dark:bg-grid-white/[1] bg-grid-white/[1]",
  boxShadow: 2,
  p: 0,
};

function SideBar({ openM, setOpenM }) {
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false); // Mobile menu state
  const [feeds, setFeeds] = useState([
    { id: 1, name: "All links", count: 2715, icon: "📥" },
    { id: 2, name: "Starred", count: 0, icon: "⭐" },
  ]);
  
  const handleOpen = () => setOpenM(true);
  const handleClose = () => setOpenM(false);
  const [animate, setAnimate] = useState(false);
  
  const svgStyles = `
    @keyframes draw {
      to {
        stroke-dashoffset: 0;
      }
    }
    
    .logo-path {
      stroke-dasharray: 1000;
      stroke-dashoffset: 1000;
      animation: draw 2s ease-in-out forwards;
    }
    
    .animate-write .logo-path {
      animation: draw 2s ease-in-out forwards;
    }
  `;

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimate(true);
      setTimeout(() => setAnimate(false), 2000);
    }, 30000);
  
    return () => clearInterval(interval);
  }, []);
  
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetchData("http://127.0.0.1:5000/json-keys");
        const dynamicItems = response.feeds.map((item, index) => ({
          id: index + 3,
          name: item.name,
          count: item.count,
          icon: item.icon,
        }));
        const totalCount = dynamicItems.reduce(
          (acc, item) => acc + item.count,
          0
        );
        const uniqueNameCount = new Set(dynamicItems.map(item => item.name)).size;

        setFeeds((prevFeeds) => [
          { id: 1, name: "All links", count: totalCount, icon: "📥" },
          { id: 2, name: "Starred", count: uniqueNameCount, icon: "⭐" },
          {
            section: "Daily",
            items: dynamicItems,
          },
        ]);
      } catch (error) {
        setError(error.message);
      }
    };
    loadData();
  }, []);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && !event.target.closest('.mobile-sidebar') && !event.target.closest('.mobile-toggle')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const SidebarContent = () => (
    <>
      <div className="flex items-center justify-between mb-4 md:justify-center">
        <Logo
          className={`h-16 md:h-20 lg:h-[5.5rem] invert opacity-70 ${animate ? 'animate-write' : ''}`}
          alt="logo"
        />
        {/* Close button for mobile */}
        <button
          onClick={() => setIsOpen(false)}
          className="md:hidden p-2 text-white hover:bg-gray-700 rounded"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="h-[calc(100vh-140px)] md:h-[calc(100vh-100px)] lg:h-[calc(100vh-100px)] overflow-y-scroll no-scrollbar bg-slate-950 p-2 border rounded-xl">
        {feeds.map((item, index) => {
          if ("section" in item) {
            return (
              <div key={index} className="px-2 mb-5">
                <div className="text-xs text-white mb-5 mt-1">
                  {item.section}
                </div>
                {item.items?.map((subItem) => (
                  <div
                    key={subItem.id}
                    className="flex items-center justify-between px-2 py-2 md:py-1 rounded hover:bg-gray-700 cursor-pointer text-sm"
                    onClick={() => setIsOpen(false)} // Close mobile menu when item is clicked
                  >
                    <div className="flex items-center space-x-2">
                      <span>{subItem.icon}</span>
                      <a
                        href={`https://${subItem.name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white hover:underline"
                      >
                        {subItem.name}
                      </a>
                    </div>
                    <span className="text-white text-xs">
                      {subItem.count}
                    </span>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div
              key={item.id}
              className="flex items-center justify-between px-4 py-2 md:py-1 rounded hover:bg-gray-700 cursor-pointer text-sm"
              onClick={() => setIsOpen(false)} // Close mobile menu when item is clicked
            >
              <div className="flex items-center space-x-2">
                <span>{item.icon}</span>
                <span className="text-white">{item.name}</span>
              </div>
              <span className="text-white text-xs">{item.count}</span>
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      <style>{svgStyles}</style>
      <Spotlight delay={12} className="opacity-0" fill="white" />
      <Toaster />

      {/* Mobile Menu Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="mobile-toggle fixed top-4 left-4 z-50 md:hidden bg-[#060a1b] text-white p-2 rounded-lg shadow-lg border border-gray-700"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Desktop Sidebar */}
      <div className="hidden md:block w-80 bg-[#060a1b] dark:bg-grid-white/[0.2] bg-grid-black/[0.2] no-scrollbar">
        <div className="absolute pointer-events-none inset-0 flex items-center justify-center dark:bg-black bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_60%,black)]"></div>
        <div className="pl-10 pr-10 pt-2">
          <SidebarContent />
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Mobile Sidebar */}
          <div className="mobile-sidebar absolute left-0 top-0 h-full w-80 max-w-[85vw] bg-[#060a1b] dark:bg-grid-white/[0.2] bg-grid-black/[0.2] shadow-xl transform transition-transform duration-300 ease-in-out">
            <div className="absolute pointer-events-none inset-0 flex items-center justify-center dark:bg-black bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_60%,black)]"></div>
            <div className="relative z-10 p-4">
              <SidebarContent />
            </div>
          </div>
        </div>
      )}

      <Modal
        open={openM}
        onClose={handleClose}
        closeAfterTransition
        BackdropComponent={Backdrop}
        BackdropProps={{
          timeout: 500,
        }}
      >
        <Fade in={openM}>
          <Box sx={{
            ...style,
            width: { xs: '95%', sm: '80%', md: '60%', lg: '52%' },
            height: { xs: '95%', sm: '90%', md: '87%' },
          }}>
            <Info />
          </Box>
        </Fade>
      </Modal>
    </>
  );
}

export default SideBar;