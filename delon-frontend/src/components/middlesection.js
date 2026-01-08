import React, { useState, useEffect, useRef } from "react";
import { MultiStepLoader as Loader } from "./ui/multi-step-loader";
import { fetchData } from "../lib/api";
import { PinContainer } from "./ui/3d-pin";

function formatDate(dateString) {
  if (!dateString) return "Unknown Time";

  // Remove the "+0000" part using regex
  const cleanDate = dateString.replace(/\s\+\d{4}$/, "");

  return cleanDate;
}
function MiddleSection({
  articles,
  setArticles,
  selectedArticle,
  setSelectedArticle,
  countArticles, setCountArticles
}) {
  const [loading, setLoading] = useState(true); // Start as loading
  const [loadingStates, setLoadingStates] = useState([]);
  const [error, setError] = useState(null); // For error handling

  // const [articles, setArticles] = useState([]);

  const hasFetchedData = useRef(false); // Prevents re-fetching

  useEffect(() => {
    const loadData = async () => {
      try {
        // Set loading state to true at the start
        setLoading(true);

        // Fetch from json-keys
        const response1 = await fetchData("http://127.0.0.1:5000/json-keys");
        const dynamicItems1 = response1.feeds.map((item) => ({
          id: item.id,
          text: item.name,
          icon: item.icon,
          count: item.count,
        }));
        setLoadingStates(dynamicItems1);

        // Fetch from fetch-rss
        const response2 = await fetch("http://127.0.0.1:5000/fetch-rss");
        const data2 = await response2.json();
        const dynamicItems2 = data2.articles.map((item) => ({
          id: item.id,
          link: item.link,
          title: item.title,
          description: item.description,
          content: item.content,
          author: item.source,
          category: item.category,
          time: item.pubDate,
          isUnread: true,
        }));

        // Remove duplicates based on article id
        const uniqueArticles = dynamicItems2.filter(
          (article, index, self) =>
            index ===
            self.findIndex(
              (a) => a.id === article.id && a.title === article.title
            )
        );

        // Set the articles and total count
        setArticles(uniqueArticles);
        setCountArticles(uniqueArticles.length);

        // Set loading to false after data is fetched
        setLoading(false);
      } catch (error) {
        setError(error.message);
        setLoading(false);
      }
    };

    if (!hasFetchedData.current) {
      hasFetchedData.current = true;
      loadData(); // Initial load on page load
    }

    // Set interval to reload every hour (60 * 60 * 1000 ms)
    const interval = setInterval(() => {
      loadData();
    }, 60 * 60 * 1000); // 1 hour interval

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  const selectArticle = (id) => {
    setSelectedArticle(id);
  };

  // const [open, setOpen] = useState(false);
  //   const handleOpen = () => { setOpen(true); }
  //   const handleClose = () => setOpen(false);
  return (
    <>

      <Loader loadingStates={loadingStates} loading={loading} duration={1850} />

      <div className="w-[490px]  bg-[#060a1b] no-scrollbar dark:bg-grid-white/[0.2] bg-grid-black/[0.2]">
        {/* Header Section */}
        <div className="h-20 p-4 pt-3 border-b">
          <div className=" text-lg text-white" style={{ fontFamily: "SF Pro light" }}> Daring Fireball</div>
          <div className="text-sm text-white">{countArticles} unread</div>
        </div>

        {/* Scrollable Article List */}
        <div className="h-[calc(100vh-80px)] flex flex-center overflow-y-scroll no-scrollbar">
          {articles.map((article, index) => (
            <div
              key={`${article.id}-${index}`}
              className={`ml-12 mr-6 pl-30 pt-[50%] mb-[1rem] w-full cursor-pointer ${selectedArticle === article.id
                  ? "text-[#000000]"
                  : "hover:bg-gray"
                }`}
              onClick={() => setSelectedArticle(article)}
            >
              <div>
                <PinContainer title={article.category} href={article.id}>
                  {article.isUnread && (
                    <div className="w-[23rem] bg-gray-600 rounded-full "></div>
                  )}
                  <div>
                    <h3
                      className="font-medium text-gray-300 text-lg text-[#bbc7fa]"
                      style={{ fontFamily: "arabic med" }}
                    >
                      <b>{article.title}</b>
                    </h3>
                    <p
                      className="text-sm pt-2 text-white"
                      dangerouslySetInnerHTML={{
                        __html: (() => {
                          const cleanDesc = article.description.replace(/<img[^>]*>/g, "");
                          const limited = cleanDesc.length > 700
                            ? cleanDesc.slice(0, 700) + "..."
                            : cleanDesc;
                          return limited;
                        })(),
                      }}
                    ></p>
                    <div
                      className="flex items-center justify-between text-xs text-[#ffffff] space-x-4"
                      style={{ fontFamily: "SF Pro light" }}
                    >
                      <span className="text-white">
                        <b>{article.author}</b>
                      </span>
                      <span>{formatDate(article.time)}</span>
                    </div>
                  </div>
                </PinContainer>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default MiddleSection;
