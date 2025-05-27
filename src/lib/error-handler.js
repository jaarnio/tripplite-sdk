/**
 * Error handling middleware for the Tripplite PDU SDK
 */
class ErrorHandler {
  /**
   * Handle API errors
   * @param {Error} error The error object
   * @param {string} context Context where the error occurred
   * @throws {Error} Enhanced error with more context
   */
  handleApiError(error, context = 'API request') {
    // Initialize with defaults
    let errorMessage = error.message || 'Unknown error';
    let statusCode = null;
    let responseData = null;
    
    // Extract more information if available
    if (error.response) {
      statusCode = error.response.status;
      responseData = error.response.data;
      
      // Create more detailed error message
      errorMessage = `${context} failed: ${errorMessage} (Status: ${statusCode})`;
      
      // Add response data if available
      if (responseData) {
        if (typeof responseData === 'object') {
          try {
            const dataStr = JSON.stringify(responseData);
            errorMessage += ` - ${dataStr.substring(0, 150)}${dataStr.length > 150 ? '...' : ''}`;
          } catch (e) {
            errorMessage += ' - Response data available but could not be stringified';
          }
        } else {
          errorMessage += ` - ${String(responseData).substring(0, 150)}${String(responseData).length > 150 ? '...' : ''}`;
        }
      }
    } else if (error.request) {
      // Request was made but no response received
      errorMessage = `${context} failed: No response received - ${errorMessage}`;
    } else {
      // Error occurred during request setup
      errorMessage = `${context} setup error: ${errorMessage}`;
    }
    
    // Create enhanced error
    const enhancedError = new Error(errorMessage);
    enhancedError.originalError = error;
    enhancedError.statusCode = statusCode;
    enhancedError.responseData = responseData;
    
    // Log the error
    console.error(errorMessage);
    
    throw enhancedError;
  }
}

// Create singleton instance
const errorHandlerInstance = new ErrorHandler();

// Export both the class and the singleton instance
module.exports = errorHandlerInstance;
module.exports.default = errorHandlerInstance; 