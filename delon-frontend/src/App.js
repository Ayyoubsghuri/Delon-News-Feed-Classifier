import SideBar from "./components/sidebar.js";
import MiddleSection from "./components/middlesection.js";
import RightSection from "./components/rightsection.js";

import React, { useState } from "react";
import "./css/index.css";
import { BrowserRouter } from "react-router-dom";

function App() {
  const [articles, setArticles] = useState([]); // Store all articles
  const [selectedArticle, setSelectedArticle] = useState(null); // Track selected article
  const [countArticles, setCountArticles] = useState(null);
  const [openM, setOpenM] = useState(false);

  return (
    <React.StrictMode>
      <BrowserRouter>
        <div className="flex h-screen bg-gray-900 overflow-hidden">
          {/* Sidebar - Hidden on mobile, shown as overlay when toggled */}
          <SideBar openM={openM} setOpenM={setOpenM} />
          
          {/* Main Content Area */}
          <div className="flex flex-1 min-w-0">
            {/* Middle Section - Article List */}
            <div className="hidden md:block">
              <MiddleSection
                articles={articles}
                setArticles={setArticles}
                countArticles={countArticles}
                setCountArticles={setCountArticles}
                selectedArticle={selectedArticle}
                setSelectedArticle={setSelectedArticle}
              />
            </div>
            
            {/* Right Section - Article Reader */}
            <div className="flex-1 min-w-0">
              <RightSection
                openM={openM}
                setOpenM={setOpenM}
                countArticles={countArticles}
                setCountArticles={setCountArticles}
                setArticles={setArticles}
                selectedArticle={selectedArticle}
                setSelectedArticle={setSelectedArticle}
                articles={articles}
              />
            </div>
          </div>

          {/* Mobile Article List - Show when no article is selected */}
          <div className="md:hidden">
            {!selectedArticle && (
              <div className="fixed inset-0 z-30 bg-[#060a1b]">
                <MiddleSection
                  articles={articles}
                  setArticles={setArticles}
                  countArticles={countArticles}
                  setCountArticles={setCountArticles}
                  selectedArticle={selectedArticle}
                  setSelectedArticle={setSelectedArticle}
                />
              </div>
            )}
          </div>

          {/* Mobile Back Button */}
          {selectedArticle && (
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedArticle(null);
                return false;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedArticle(null);
                  return false;
                }
              }}
              className="md:hidden fixed top-4 right-4 z-50 bg-gray-800 text-white p-2 rounded-lg shadow-lg border border-gray-600 hover:bg-gray-700 transition-colors cursor-pointer select-none"
            >
              <svg className="h-6 w-6 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </div>
          )}
        </div>
      </BrowserRouter>
    </React.StrictMode>
  );
}

export default App;