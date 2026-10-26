(() => {
  'use strict';
  const categoryData = {
    water: {
      title: 'Water & Drinking Water', image: 'water.svg', alt: 'Residents waiting at a dry community water tap',
      description: 'Reliable access to safe drinking water supports health, daily routines, and the wellbeing of every household. This category helps describe shortages, interruptions, water quality, and affordability in your area.',
      examples: ['Irregular or limited water supply', 'Water with unusual colour, smell, or taste', 'Dependence on tankers or other costly sources']
    },
    roads: {
      title: 'Roads & Transport', image: 'roads.svg', alt: 'Commuters navigating a pothole-damaged neighborhood road',
      description: 'Road and transport conditions affect access to work, education, healthcare, and essential services. Share experiences with damaged roads, public transport access, safety, or travel delays.',
      examples: ['Potholes or damaged road surfaces', 'Limited or unreliable public transport', 'Unsafe or difficult trips to essential destinations']
    },
    waste: {
      title: 'Garbage & Waste Management', image: 'waste.svg', alt: 'Uncollected household waste beside an overflowing public bin',
      description: 'Regular collection and responsible waste handling help keep shared spaces clean and healthy. This category covers collection schedules, overflowing bins, litter, and recycling access.',
      examples: ['Missed or irregular garbage collection', 'Overflowing bins or waste left in public areas', 'Limited facilities for separating recyclable waste']
    },
    drainage: {
      title: 'Drainage & Sewage', image: 'drainage.svg', alt: 'A blocked roadside drain causing waterlogging after rain',
      description: 'Working drainage systems carry rainwater and wastewater away from homes and roads. Share local experiences with blocked drains, waterlogging, stagnant water, or maintenance needs.',
      examples: ['Blocked or poorly maintained drains', 'Waterlogging after rainfall', 'Sewage overflow or stagnant water in public spaces']
    },
    electricity: {
      title: 'Electricity & Power', image: 'electricity.svg', alt: 'A neighborhood experiencing an evening power outage',
      description: 'Reliable electricity supports household needs, learning, work, safety, and local services. This category covers outages, voltage changes, street lighting, and the effects of interruptions.',
      examples: ['Frequent or lengthy unplanned power cuts', 'Voltage fluctuations or unreliable peak-hour supply', 'Insufficient street lighting near homes']
    },
    healthcare: {
      title: 'Healthcare', image: 'healthcare.svg', alt: 'Residents waiting at a busy community health clinic',
      description: 'Accessible healthcare helps people get timely advice and treatment close to home. Share experiences with nearby facilities, waiting times, medicine availability, affordability, or emergency care.',
      examples: ['Long waits or difficulty getting appointments', 'Limited availability of doctors or essential medicines', 'Travel distance or cost that makes care difficult']
    },
    employment: {
      title: 'Employment', image: 'employment.svg', alt: 'Job seekers waiting outside a community employment center',
      description: 'Access to suitable work and useful employment support can strengthen households and communities. This category asks about local opportunities, skills, job information, and barriers to finding work.',
      examples: ['Few nearby jobs suited to a person’s skills', 'Limited access to job listings or career guidance', 'Difficulty reaching training or employment services']
    },
    education: {
      title: 'Education', image: 'education.svg', alt: 'Students learning in a classroom with limited resources',
      description: 'Learning opportunities depend on safe, accessible facilities and the resources students need. Share experiences with school access, classroom conditions, teaching support, or digital learning.',
      examples: ['Crowded classrooms or limited learning materials', 'Difficulty reaching schools or colleges', 'Unreliable internet or access to digital learning']
    }
  };
  const params = new URLSearchParams(location.search);
  const key = params.get('category') || '';
  const category = categoryData[key];
  if (!category) {
    location.replace('index.html#categories');
    return;
  }
  document.title = `${category.title} — PeoplePulse AI`;
  document.querySelector('#categoryTitle').textContent = category.title;
  document.querySelector('#categoryDescription').textContent = category.description;
  const image = document.querySelector('#categoryImage');
  image.src = `assets/categories/${category.image}`;
  image.alt = category.alt;
  document.querySelector('#categoryExamples').innerHTML = category.examples
    .map(example => `<li>${example.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}</li>`).join('');
  document.querySelector('#startCategorySurvey').addEventListener('click', async () => {
    localStorage.setItem('pp_pending_category', key);
    let signedIn = false;
    try {
      const { data } = await window.ppSupabaseClient?.auth.getSession();
      signedIn = !!data?.session?.user;
    } catch { /* Route to login if session status cannot be checked. */ }
    if (signedIn) location.href = `survey.html?category=${encodeURIComponent(key)}`;
    else location.href = 'login.html';
  });
})();
