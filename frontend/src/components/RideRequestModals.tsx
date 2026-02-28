interface RideRequestWaitingProps {
  nearbyDriversCount: number;
  onCancel: () => void;
}

export function RideRequestWaiting({ nearbyDriversCount, onCancel }: RideRequestWaitingProps) {
  return (
    <div className="fixed inset-0 z-[2000] bg-black bg-opacity-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-slideUp">
        <div className="text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Finding a Driver</h3>
          <p className="text-gray-600 mb-4">
            We've sent your request to {nearbyDriversCount} nearby drivers
          </p>
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <p className="text-sm text-gray-500">Request expires in 15 seconds</p>
          <button
            onClick={onCancel}
            className="mt-4 w-full py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition"
          >
            Cancel Request
          </button>
        </div>
      </div>
    </div>
  );
}

interface RideAcceptedProps {
  driverName: string;
  driverId: string;
  onContinue: () => void;
}

export function RideAccepted({ driverName, driverId, onContinue }: RideAcceptedProps) {
  return (
    <div className="fixed inset-0 z-[2000] bg-black bg-opacity-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-slideUp">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Driver Found!</h3>
          <p className="text-gray-600 mb-4">
            {driverName} has accepted your ride request
          </p>
          <div className="bg-indigo-50 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Driver ID:</span>
              <span className="font-medium text-gray-900">{driverId.slice(0, 8)}...</span>
            </div>
          </div>
          <button
            onClick={onContinue}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

interface RideRequestExpiredProps {
  onTryAgain: () => void;
}

export function RideRequestExpired({ onTryAgain }: RideRequestExpiredProps) {
  return (
    <div className="fixed inset-0 z-[2000] bg-black bg-opacity-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-slideUp">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Request Expired</h3>
          <p className="text-gray-600 mb-4">
            No drivers accepted your request. Please try again.
          </p>
          <button
            onClick={onTryAgain}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
