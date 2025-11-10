import React from 'react';

/**
 * Loading skeleton component for tables
 */
export const TableSkeleton = ({ rows = 5, columns = 5 }) => (
    <div className="animate-pulse">
        <div className="h-12 bg-gray-200 rounded mb-4"></div>
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded mb-2 flex gap-4">
                {Array.from({ length: columns }).map((_, j) => (
                    <div key={j} className="flex-1 h-4 bg-gray-200 rounded"></div>
                ))}
            </div>
        ))}
    </div>
);

/**
 * Loading skeleton component for stat cards
 */
export const CardSkeleton = () => (
    <div className="animate-pulse bg-gradient-to-r from-gray-200 to-gray-300 rounded-lg p-6 h-32">
        <div className="h-4 bg-gray-300 rounded w-3/4 mb-4"></div>
        <div className="h-8 bg-gray-300 rounded w-1/2"></div>
    </div>
);

/**
 * Loading skeleton component for document list items
 */
export const ListItemSkeleton = () => (
    <div className="animate-pulse p-4 border rounded mb-2">
        <div className="flex justify-between items-center">
            <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/4"></div>
            </div>
            <div className="h-4 bg-gray-200 rounded w-20"></div>
        </div>
    </div>
);

/**
 * Loading skeleton component for pages
 */
export const PageSkeleton = () => (
    <div className="animate-pulse space-y-6">
        <div className="h-10 bg-gray-200 rounded w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
        </div>
        <div className="h-96 bg-gray-100 rounded"></div>
    </div>
);

export default { TableSkeleton, CardSkeleton, ListItemSkeleton, PageSkeleton };

