exports.handler = async function(event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Parse request body
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { jobTitle, jobDesc, cvText, extras, tone, region } = body;

  if (!jobDesc || !cvText) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Job description and CV are required' }) };
  }

  // Build the prompt
  const systemPrompt = `You are an elite career coach and professional CV writer with 20 years of experience helping candidates land jobs at top companies. You specialise in tailoring CVs and cover letters to specific job descriptions, optimising for ATS (Applicant Tracking Systems), and writing in a tone that resonates with hiring managers.

You must respond ONLY with a valid JSON object — no markdown, no backticks, no preamble, no explanation outside the JSON. The JSON must match this exact structure:
{
  "match_score": 85,
  "matched_keywords": ["keyword1", "keyword2", "keyword3"],
  "tailored_cv": "complete tailored CV text here",
  "cover_letter": "complete cover letter text here",
  "key_changes": ["change 1", "change 2", "change 3"]
}

Rules:
- match_score: integer 0-100 estimating how well the tailored CV matches the job description
- matched_keywords: 5-8 important keywords from the job description that appear in the tailored CV
- tailored_cv: a fully rewritten, ATS-optimised CV that highlights experience most relevant to this role. Keep all facts true — do not invent experience. Tone: ${tone}. Format for ${region} job market.
- cover_letter: 3 compelling paragraphs. Paragraph 1: hook — why this role/company. Paragraph 2: proof — 2-3 specific achievements relevant to the role. Paragraph 3: close — enthusiasm and call to action. Same tone and region format.
- key_changes: exactly 3 bullet points explaining the most important changes made and why they improve the application`;

  const userMessage = `Please tailor this job application.

JOB TITLE: ${jobTitle || 'Not specified'}

JOB DESCRIPTION:
${jobDesc}

CANDIDATE CV:
${cvText}

ADDITIONAL NOTES FROM CANDIDATE:
${extras || 'None'}

Generate the tailored CV and cover letter now. Remember: respond with valid JSON only.`;

  // Call Groq API
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage  }
        ]
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Groq API error:', errData);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'AI service error. Please try again.' })
      };
    }

    const groqData = await response.json();
    const raw = groqData.choices?.[0]?.message?.content || '';

    // Parse JSON — strip any accidental backtick fences
    const clean = raw.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error('JSON parse error. Raw response:', raw);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Could not parse AI response. Please try again.' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Something went wrong. Please try again.' })
    };
  }
};
