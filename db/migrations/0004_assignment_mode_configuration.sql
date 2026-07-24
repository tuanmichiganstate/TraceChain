PRAGMA foreign_keys = ON;

ALTER TABLE assignments
ADD COLUMN mode_configuration_json TEXT NOT NULL
  DEFAULT '{"mode":"standard","allowHints":false,"allowRetry":false,"allowBacktracking":false,"feedbackTiming":"final","showScores":false,"outcomeStrategy":"forced","seedPolicy":"supplied","allowCommunication":false,"allowEvidenceRequests":true}'
  CHECK (json_valid(mode_configuration_json));

UPDATE assignments
SET mode_configuration_json =
  CASE run_mode
    WHEN 'tutorial' THEN
      '{"mode":"tutorial","allowHints":true,"allowRetry":true,"allowBacktracking":true,"feedbackTiming":"immediate","showScores":true,"outcomeStrategy":"forced","seedPolicy":"supplied","allowCommunication":false,"allowEvidenceRequests":true}'
    WHEN 'sandbox' THEN
      '{"mode":"sandbox","allowHints":true,"allowRetry":true,"allowBacktracking":true,"feedbackTiming":"immediate","showScores":false,"outcomeStrategy":"forced","seedPolicy":"supplied","allowCommunication":false,"allowEvidenceRequests":true}'
    WHEN 'configured' THEN
      '{"mode":"configured","allowHints":false,"allowRetry":false,"allowBacktracking":false,"feedbackTiming":"stage-end","showScores":false,"outcomeStrategy":"forced","seedPolicy":"supplied","allowCommunication":false,"allowEvidenceRequests":true}'
    ELSE
      '{"mode":"standard","allowHints":false,"allowRetry":false,"allowBacktracking":false,"feedbackTiming":"final","showScores":false,"outcomeStrategy":"forced","seedPolicy":"supplied","allowCommunication":false,"allowEvidenceRequests":true}'
  END;
