import React, { useState, useEffect } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function Info() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalArticles: '0',
    activeUsers: '0',
    commandsToday: '0',
    systemUptime: '0%'
  });
  
  const [pubDateData, setPubDateData] = useState(null);
  const [timelineData, setTimelineData] = useState(null);
  const [sourceDistributionData, setSourceDistributionData] = useState(null);
  const [matchedPlaces, setMatchedPlaces] = useState([]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: 'white'
        }
      },
      title: {
        display: true,
        color: 'white'
      }
    },
    scales: {
      y: {
        ticks: { color: 'white' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      },
      x: {
        ticks: { color: 'white' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: 'white'
        }
      }
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch all data in parallel
      const [
        pubDateRes,
        timelineRes,
        sourceRes,
        placesRes,
        statsRes
      ] = await Promise.all([
        fetch('http://127.0.0.1:5000/analytics/pubdate-stats'),
        fetch('http://127.0.0.1:5000/analytics/article-timeline'),
        fetch('http://127.0.0.1:5000/analytics/source-distribution'),
        fetch('http://127.0.0.1:5000/analytics/matched-places'),
        fetch('http://127.0.0.1:5000/analytics/quick-stats')
      ]);

      const pubDateData = await pubDateRes.json();
      const timelineData = await timelineRes.json();
      const sourceData = await sourceRes.json();
      const placesData = await placesRes.json();
      const statsData = await statsRes.json();

      // Update publication date chart data
      setPubDateData({
        labels: pubDateData.labels,
        datasets: [{
          label: 'Articles Published',
          data: pubDateData.data,
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1,
        }]
      });

      // Update timeline chart data
      setTimelineData({
        labels: timelineData.labels,
        datasets: [{
          label: 'Articles Published',
          data: timelineData.data,
          fill: true,
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgba(75, 192, 192, 1)',
          tension: 0.4
        }]
      });

      // Update source distribution chart data
      setSourceDistributionData({
        labels: sourceData.labels,
        datasets: [{
          data: sourceData.data,
          backgroundColor: [
            'rgba(255, 99, 132, 0.8)',
            'rgba(54, 162, 235, 0.8)',
            'rgba(255, 206, 86, 0.8)',
            'rgba(75, 192, 192, 0.8)',
          ],
          borderColor: [
            'rgba(255, 99, 132, 1)',
            'rgba(54, 162, 235, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(75, 192, 192, 1)',
          ],
          borderWidth: 1,
        }]
      });

      // Update matched places
      setMatchedPlaces(placesData.places);

      // Update quick stats
      setStats({
        totalArticles: statsData.totalArticles || '0',
        activeUsers: statsData.activeUsers || '0',
        commandsToday: statsData.commandsToday || '0',
        systemUptime: statsData.systemUptime || '0%'
      });

    } catch (error) {
      console.error('Error fetching analytics data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 no-scrollbar dark:bg-grid-white/[0.2] bg-grid-black/[0.2]">
      <div className="max-w-7xl mx-auto no-scrollbar">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">System Analytics</h1>
          <button 
            onClick={fetchData}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Refreshing...
              </>
            ) : 'Refresh Data'}
          </button>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Publication Date Stats Chart */}
              <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold mb-4">Most Active Publication Dates</h2>
                <div className="h-[300px]">
                  {pubDateData ? (
                    <Bar 
                      data={pubDateData} 
                      options={{
                        ...chartOptions,
                        plugins: {
                          ...chartOptions.plugins,
                          tooltip: {
                            callbacks: {
                              label: function(context) {
                                return `${context.parsed.y} articles published`;
                              }
                            }
                          }
                        }
                      }} 
                    />
                  ) : (
                    <div className="text-gray-400">No publication date data available</div>
                  )}
                </div>
              </div>

              {/* Timeline Chart */}
              <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold mb-4">Article Publication Timeline</h2>
                <div className="h-[300px]">
                  {timelineData ? (
                    <Line data={timelineData} options={chartOptions} />
                  ) : (
                    <div className="text-gray-400">No timeline data available</div>
                  )}
                </div>
              </div>

              {/* Source Distribution Chart */}
              <div className="bg-gray-800 p-6 rounded-lg shadow-lg md:col-span-2">
                <h2 className="text-xl font-semibold mb-4">Content Source Distribution</h2>
                <div className="h-[300px]">
                  {sourceDistributionData ? (
                    <Doughnut data={sourceDistributionData} options={doughnutOptions} />
                  ) : (
                    <div className="text-gray-400">No source data available</div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
              {[
                { label: 'Total Articles', value: stats.totalArticles, color: 'bg-blue-500' },
                { label: 'Articles Today', value: stats.articlesToday || '0', color: 'bg-green-500' },
                { label: 'Top Day Count', value: pubDateData?.data ? Math.max(...pubDateData.data) : '0', color: 'bg-purple-500' },
                { label: 'System Uptime', value: stats.systemUptime, color: 'bg-red-500' }
              ].map((stat, index) => (
                <div key={index} className={`${stat.color} p-4 rounded-lg shadow-lg`}>
                  <h3 className="text-lg font-medium">{stat.label}</h3>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Top Matched Places */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg mt-8">
              <h2 className="text-xl font-semibold mb-4">Top Matched Places</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                {matchedPlaces.length > 0 ? (
                  matchedPlaces.map((place, index) => (
                    <div key={index} className="bg-gray-700 p-4 rounded-lg">
                      <span className="text-yellow-300 font-medium">{index + 1}.</span> {place}
                    </div>
                  ))
                ) : (
                  <div className="text-gray-400">No places data available</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Info;