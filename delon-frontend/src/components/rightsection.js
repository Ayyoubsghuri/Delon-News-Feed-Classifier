import React, { useState } from "react";
import { TextGenerateEffect } from "./ui/text-generate-effect";
import { PlaceholdersAndVanishInput } from "./ui/placeholders-and-vanish-input";
import { LinkPreview } from "./ui/link-preview";
import toast, { Toaster } from "react-hot-toast";
import { cn } from "../lib/utils";
import { Lens } from "./ui/lens";
import parse from "html-react-parser";
import { motion } from "framer-motion";
import { Trash2, Share2, ExternalLink, Clock, Play, Code, Plus, ChevronUp, ChevronDown, Rss } from 'lucide-react';
import { Highlight } from "./ui/hero-highlight";
import * as Tooltip from '@radix-ui/react-tooltip';

function formatDate(dateString) {
  if (!dateString) return "Unknown Time";
  return dateString.replace(/\s\+\d{4}$/, "");
}

const notify = (text) =>
  toast.custom((t) => (
    <div
      className={`notificationWrapper bg-white px-6 shadow-md rounded-full ${t.visible ? "animate-down" : "animate-up"
        }`}
    >
      {text}
    </div>
  ));

function RightSection({ openM, setOpenM, countArticles, setCountArticles, setArticles, selectedArticle, setSelectedArticle, articles }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [hovering, setHovering] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentSearchTerm, setCurrentSearchTerm] = useState("");
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(false); // Mobile toolbar state
  const handleOpenM = () => setOpenM(true);
  const handleCloseM = () => setOpenM(false);
  const [shareCount, setShareCount] = useState(null);
  const [loadingShares, setLoadingShares] = useState(false);
  const [floatingMode, setFloatingMode] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [targetCount, setTargetCount] = useState(5);

  // New state for RSS validation modal
  const [showRssModal, setShowRssModal] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isValidatingRss, setIsValidatingRss] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const placeholders = [
    "What source you want to filter with?",
    "A keyword to find?",
    "A command to do (-f, -d, -h).",
    "Open Excel?",
  ];

  const handleChange = (e) => {
    console.log(e);
  };

  // New function to validate RSS feed
  const validateRssFeed = async (url) => {
    if (!url.trim()) {
      notify("Please enter a website URL");
      return;
    }

    setIsValidatingRss(true);
    setValidationResult(null);

    try {
      const response = await fetch('http://localhost:5000/validate-rss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() })
      });

      if (!response.ok) {
        throw new Error('Failed to validate RSS feed');
      }

      const data = await response.json();
      setValidationResult(data);
      
      if (data.valid) {
        notify(`✅ RSS feed found: ${data.feed_url || data.message}`);
      } else {
        notify(`❌ No RSS feed found: ${data.message}`);
      }
    } catch (error) {
      console.error('Error validating RSS feed:', error);
      setValidationResult({
        valid: false,
        message: 'Failed to validate RSS feed. Please try again.'
      });
      notify('Failed to validate RSS feed');
    } finally {
      setIsValidatingRss(false);
    }
  };

  const handleRssSubmit = (e) => {
    e.preventDefault();
    validateRssFeed(websiteUrl);
  };

  const resetRssModal = () => {
    setShowRssModal(false);
    setWebsiteUrl("");
    setValidationResult(null);
    setIsValidatingRss(false);
  };

  const fetchAvailableCategories = async () => {
    try {
      const response = await fetch('http://localhost:5000/available-categories');
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      setAvailableCategories(data.categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      notify('Failed to fetch available categories');
    }
  };

  const handleCompleteCategory = async () => {
    if (selectedCategories.length === 0) {
      notify('Please select at least one category');
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/get-missing-articles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          categories: selectedCategories,
          count: targetCount,
          current_articles: articles.map(a => a.id)
        })
      });

      if (!response.ok) throw new Error('Failed to fetch missing articles');

      const data = await response.json();
      const newArticles = data.articles.map(article => ({
        id: article.id,
        link: article.link,
        title: article.title,
        description: article.description,
        content: article.content,
        author: article.source,
        time: article.pubDate,
        isUnread: true,
        source: article.source,
        matched_places: article.matched_places,
        category: article.category
      }));

      setArticles(prev => [...prev, ...newArticles]);
      setCountArticles(prev => prev + newArticles.length);
      setShowCategoryModal(false);
      notify(`Added ${newArticles.length} articles from selected categories`);
    } catch (error) {
      console.error('Error completing categories:', error);
      notify('Failed to fetch missing articles');
    }
  };

  const handleSearch = async (query) => {
    notify('Trying to search...');
    setCurrentSearchTerm(query);

    try {
      if (floatingMode) {
        await filterByTime();
        return;
      }

      const response = await fetch(
        `http://localhost:5000/search?query=${encodeURIComponent(query)}`
      );

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();

      const formattedArticles = data.articles.map(article => ({
        id: article.id,
        link: article.link,
        title: article.title,
        description: article.description,
        content: article.content,
        author: article.source,
        time: article.pubDate,
        isUnread: true,
        source: article.source,
        matched_places: article.matched_places,
        category: article.category
      }));

      setArticles(formattedArticles);
      setCountArticles(formattedArticles.length);
      notify(`Found ${formattedArticles.length} articles`);
    } catch (error) {
      console.error('Search error:', error);
      notify('Failed to search articles');
      setCurrentSearchTerm("");
    }
  };

  const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const highlightText = (text) => {
    if (!currentSearchTerm || !text) return parse(text);

    const escapedTerm = escapeRegExp(currentSearchTerm);
    const parts = text.split(new RegExp(`(${escapedTerm})`, 'gi'));

    return parts.map((part, i) =>
      part.toLowerCase() === currentSearchTerm.toLowerCase() ? (
        <Highlight key={i} className="text-black dark:text-white">
          {part}
        </Highlight>
      ) : (
        parse(part)
      )
    );
  };

  const parseContent = (content, hovering, setHovering) => {
    const regex = /<img[^>]*src="([^"]*)"[^>]*>/g;
    const elements = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const imageSrc = match[1];

      if (lastIndex < match.index) {
        elements.push(
          <motion.div
            key={`text-${lastIndex}`}
            animate={{
              filter: hovering ? "blur(2px)" : "blur(0px)",
            }}
            className="py-4 relative"
          >
            {highlightText(content.substring(lastIndex, match.index))}
          </motion.div>
        );
      }

      elements.push(
        <Lens
          key={match.index}
          zoomFactor={1.5}
          lensSize={150}
          hovering={hovering}
          setHovering={setHovering}
        >
          <img src={imageSrc} alt="Zoomable content" className="rounded-lg max-w-full h-auto" />
        </Lens>
      );

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
      elements.push(
        <motion.div
          key={`text-${lastIndex}`}
          animate={{
            filter: hovering ? "blur(2px)" : "blur(0px)",
            opacity: 1,
            y: [20, -5, 0],
          }}
          transition={{
            duration: 0.5,
            ease: [0.4, 0.0, 0.2, 1],
          }}
          initial={{
            opacity: 0,
            y: 20,
          }}
          className="py-4 relative"
        >
          {highlightText(content.substring(lastIndex))}
        </motion.div>
      );
    }

    return elements;
  };

  const handleCommand = (input) => {
    const [command, ...args] = input.split(" ");

    switch (command) {
      case "-d":
        if (selectedArticle?.id && selectedArticle?.title) {
          deleteArticle(selectedArticle.id, selectedArticle.title);
          notify("Selected article successfully deleted 🥂!");
        } else {
          notify("no article selected for deletion. 😔!");
          console.log("No article selected for deletion.");
        }
        break;
      case "-m":
        setFloatingMode(!floatingMode);
        notify(`Floating mode ${!floatingMode ? "enabled" : "disabled"}`);
        break;
      case "-c":
        handleOpenM();
        console.log("Showing Charts...");
        break;
      default:
        if (input.trim()) {
          handleSearch(input);
        } else {
          setCurrentSearchTerm("");
          notify("Please enter a search term");
        }
    }
  };

  const deleteArticle = async (articleId, articleTitle) => {
    try {
      setArticles((prevArticles) =>
        prevArticles.filter((article) => article.title !== articleTitle)
      );

      const response = await fetch(
        `http://localhost:5000/delete?article_id=${articleId}&article_title=${encodeURIComponent(
          articleTitle
        )}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        setShowConfirm(false);
        notify("no article selected for deletion Or the article already deleted. 😔!");
        throw new Error(`Failed to delete article: ${response.statusText}`);
      }

      const result = await response.json();
      console.log("Delete response:", result);
      setShowConfirm(false);
      setSelectedArticle(null);
    } catch (error) {
      console.error("Error deleting article:", error);
    }
  };

  const handleDelete = () => {
    setShowConfirm(true);
  };

  const onSubmit = (inputValue) => {
    if (!inputValue.trim()) {
      setCurrentSearchTerm("");
      return;
    }
    handleCommand(inputValue);
  };

  const fetchShareCounts = async (url) => {
    if (!url) {
      setShareCount(null);
      return;
    }
    setLoadingShares(true);
    try {
      const response = await fetch(
        `http://localhost:5000/get-share-counts?url=${encodeURIComponent(url)}`
      );
      if (!response.ok) throw new Error('Failed to fetch share counts');
      const data = await response.json();
      console.log("Fetched share counts:", data);
      setShareCount(data);
    } catch (error) {
      console.error('Error fetching share counts:', error);
      setShareCount(null);
    } finally {
      setLoadingShares(false);
    }
  };

  const renderShareCounts = () => {
    if (!shareCount) return null;

    const facebookTotal = shareCount.Facebook || 0;
    const fbDetails = shareCount.FacebookDetails || {};

    return (
      <div className="text-xs">
        <div className="font-medium">Facebook: {facebookTotal} shares</div>
        {facebookTotal > 0 && (
          <div className="text-gray-300">
            <div>Comments: {fbDetails.comments || 0}</div>
            <div>Reactions: {fbDetails.reactions || 0}</div>
            <div>Shares: {fbDetails.shares || 0}</div>
          </div>
        )}
      </div>
    );
  };

  const activateScript = async () => {
    try {
      const response = await fetch('http://localhost:5000/activate-script', {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to activate script');
      const result = await response.json();
      notify(`Script activated: ${result.message}`);
    } catch (error) {
      console.error('Error activating script:', error);
      notify('Failed to activate script');
    }
  };

  const filterByTime = async (timeThreshold = "10:30") => {
    try {
      const response = await fetch(`http://localhost:5000//filter-by-time?time=${timeThreshold}`);
      if (!response.ok) throw new Error('Failed to filter articles');
      const data = await response.json();

      const formattedArticles = data.articles.map(article => ({
        id: article.id,
        link: article.link,
        title: article.title,
        description: article.description,
        content: article.content,
        author: article.source,
        time: article.pubDate,
        isUnread: true,
        source: article.source,
        matched_places: article.matched_places,
        category: article.category
      }));

      setArticles(formattedArticles);
      setCountArticles(formattedArticles.length);
      notify(`Filtered ${formattedArticles.length} articles (Time: ${data.filter_time}, Current: ${data.current_time})`);
    } catch (error) {
      console.error('Error filtering articles:', error);
      notify('Failed to filter articles');
    }
  };

  const ToolbarContent = () => (
    <div className="flex items-center space-x-4 md:space-x-6 text-white">
      <Tooltip.Provider delayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <div
              className="flex flex-col items-center cursor-pointer hover:text-green-400 p-2 md:p-0"
              onClick={() => selectedArticle && fetchShareCounts(selectedArticle.link)}
            >
              <Share2 className="h-5 w-5" />
              <span className="text-xs mt-1 hidden md:block" style={{ fontFamily: "SF Pro light" }}>
                Share
              </span>
            </div>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="bg-gray-800 text-white text-sm rounded-md p-2 shadow-lg z-[100] data-[state=delayed-open]:data-[side=top]:animate-slideDownAndFade"
              side="top"
              sideOffset={5}
            >
              {loadingShares ? (
                <div className="flex justify-center items-center p-2">
                  <span className="animate-spin">⌛</span>
                </div>
              ) : (
                renderShareCounts() || <div className="text-xs">No share data</div>
              )}
              <Tooltip.Arrow className="fill-gray-800" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>

      <div
        className="flex flex-col items-center cursor-pointer hover:text-red-400 p-2 md:p-0"
        onClick={handleDelete}
      >
        <Trash2 className="h-5 w-5" />
        <span className="text-xs mt-1 hidden md:block" style={{ fontFamily: "SF Pro light" }}>
          Delete
        </span>
      </div>

      {/* New RSS Validation Button */}
      <div
        className="flex flex-col items-center cursor-pointer hover:text-purple-400 p-2 md:p-0"
        onClick={() => setShowRssModal(true)}
      >
        <Rss className="h-5 w-5" />
        <span className="text-xs mt-1 hidden md:block" style={{ fontFamily: "SF Pro light" }}>
          Check RSS
        </span>
      </div>

      <div
        className={`flex flex-col items-center cursor-pointer p-2 md:p-0 ${floatingMode ? "text-green-400" : "hover:text-yellow-400"
          }`}
        onClick={() => {
          setFloatingMode(!floatingMode);
          notify(`Floating Mode ${!floatingMode ? "enabled ✅" : "disabled ❌"}`);
        }}
      >
        <Clock className="h-5 w-5" />
        <span className="text-xs mt-1" style={{ fontFamily: "SF Pro light" }}>
          {floatingMode ? "ON ✅" : "OFF"}
        </span>
      </div>

      <div className="flex flex-col items-center cursor-pointer hover:text-blue-400 p-2 md:p-0 hidden md:flex">
        <span className="text-xs mt-1" style={{ fontFamily: "SF Pro light" }}>
          Hover over source link
        </span>
      </div>
    </div>
  );

  return (
    <>
      {/* RSS Validation Modal */}
      {showRssModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
            <h2 className="text-xl font-bold mb-4 text-black dark:text-white">Check RSS Feed</h2>
            
            <form onSubmit={handleRssSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Website URL:
                </label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                  required
                />
              </div>

              {validationResult && (
                <div className={`mb-4 p-3 rounded ${validationResult.valid ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'}`}>
                  <div className="font-semibold">
                    {validationResult.valid ? '✅ RSS Feed Found' : '❌ No RSS Feed Found'}
                  </div>
                  {validationResult.message && (
                    <div className="text-sm mt-1">{validationResult.message}</div>
                  )}
                  {validationResult.feed_url && (
                    <div className="text-sm mt-2">
                      <strong>Feed URL:</strong> 
                      <a 
                        href={validationResult.feed_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 underline ml-1"
                      >
                        {validationResult.feed_url}
                      </a>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={resetRssModal}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isValidatingRss}
                  className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isValidatingRss ? 'Validating...' : 'Check RSS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 text-black dark:text-white">Complete Your Selection</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Number of articles to add:
              </label>
              <input
                type="number"
                min="1"
                value={targetCount}
                onChange={(e) => setTargetCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select categories to complete:
              </label>
              <div className="max-h-60 overflow-y-auto border rounded p-2 dark:bg-gray-700">
                {Array.isArray(availableCategories) && availableCategories.map(category => (
                  <div key={category} className="flex items-center mb-2">
                    <input
                      type="checkbox"
                      id={`category-${category}`}
                      checked={selectedCategories.includes(category)}
                      onChange={() => {
                        setSelectedCategories(prev =>
                          prev.includes(category)
                            ? prev.filter(c => c !== category)
                            : [...prev, category]
                        );
                      }}
                      className="mr-2"
                    />
                    <label htmlFor={`category-${category}`} className="text-black dark:text-white text-sm">
                      {category}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setSelectedCategories([]);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteCategory}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Add Articles
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="flex-1 bg-[#0f1b51] dark:bg-grid-white/[0.1] bg-grid-white/[0.1] no-scrollbar overflow-hidden"
        style={{ fontFamily: "arabic med" }}
      >
        {/* Mobile Toolbar Toggle */}
        <div className="md:hidden bg-gray-900 p-2">
          <button
            onClick={() => setIsToolbarExpanded(!isToolbarExpanded)}
            className="w-full flex items-center justify-between text-white p-2 rounded"
          >
            <span>Tools</span>
            {isToolbarExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>

        {/* Toolbar */}
        <div className={`p-2 md:p-4 bg-gray-900 rounded-lg transition-all duration-300 ${
          isToolbarExpanded ? 'block' : 'hidden md:block'
        }`}>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0">
            <ToolbarContent />
            <div className="flex items-center space-x-2 w-full md:w-auto">
              <div className="relative flex-1 md:flex-none">
                <PlaceholdersAndVanishInput
                  placeholders={placeholders}
                  onChange={handleChange}
                  onSubmit={onSubmit}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Article Content */}
        <div className="h-[calc(100vh-140px)] md:h-[calc(100vh-100px)] overflow-y-scroll no-scrollbar">
          {selectedArticle ? (
            <div className="p-4 md:p-8 pt-8 md:pt-20">
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">
                <TextGenerateEffect
                  key={selectedArticle.id + selectedArticle.time}
                  words={selectedArticle.title}
                />
              </h1>
              <div className="text-white mb-6">
                <LinkPreview
                  url={selectedArticle.link}
                  className="text-blue-500 z-50"
                  width={200}
                  height={200}
                >
                  <TextGenerateEffect
                    key={selectedArticle.id + selectedArticle.time}
                    words={`${selectedArticle.author || "Unknown Author"
                      } • ${formatDate(selectedArticle.time)}`}
                  />
                </LinkPreview>
              </div>
              <div dir="rtl" className="text-sm pt-2 text-white">
                {parseContent(selectedArticle.content, hovering, setHovering)}
              </div>
            </div>
          ) : (
            <div className="p-4 md:p-8 text-gray-500 text-center">
              <div className="mt-20">
                <h2 className="text-xl md:text-2xl mb-4">No article selected</h2>
                <p className="text-sm md:text-base">Select an article from the list to read it here</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && selectedArticle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Confirm Delete</h2>
            <p className="mb-4 text-sm md:text-base">Are you sure you want to delete "{selectedArticle.title}"?</p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteArticle(selectedArticle.id, selectedArticle.title)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Menu */}
      {floatingMode && (
        <div className="fixed bottom-6 right-6 flex flex-col items-end space-y-3 z-50">
          {expanded && (
            <>
              <motion.div
                className="bg-green-500 text-white p-3 rounded-full shadow-lg cursor-pointer hover:bg-green-600"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => {
                  activateScript();
                  setExpanded(false);
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Play className="h-5 w-5" />
              </motion.div>
              <motion.div
                className="bg-orange-500 text-white p-3 rounded-full shadow-lg cursor-pointer hover:bg-orange-600"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                onClick={() => {
                  fetchAvailableCategories();
                  setShowCategoryModal(true);
                  setExpanded(false);
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Plus className="h-5 w-5" />
              </motion.div>
              <motion.div
                className="bg-purple-500 text-white p-3 rounded-full shadow-lg cursor-pointer hover:bg-purple-600"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                onClick={() => {
                  setShowRssModal(true);
                  setExpanded(false);
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Rss className="h-5 w-5" />
              </motion.div>
              <motion.div
                className="bg-gray-500 text-white p-3 rounded-full shadow-lg cursor-pointer hover:bg-gray-600"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                onClick={() => {
                  filterByTime();
                  setExpanded(false);
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Clock className="h-5 w-5" />
              </motion.div>
            </>
          )}

          <motion.div
            className="bg-blue-500 text-white p-4 rounded-full shadow-lg cursor-pointer hover:bg-blue-600"
            onClick={() => setExpanded(!expanded)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ExternalLink className="h-6 w-6" />
          </motion.div>
        </div>
      )}

      <Toaster />
    </>
  );
}

export default RightSection;