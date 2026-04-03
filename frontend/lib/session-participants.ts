import { supabase } from "./supabase";


type JoinedSessionRow = {
  session_id: string;
};

export async function joinSession(sessionId: string) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("session_participants")
    .insert([
      {
        session_id: sessionId,
        student_id: user.id,
      },
    ])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getJoinedSessionIds() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("session_participants")
    .select("session_id")
    .eq("student_id", user.id);

  if (error) {
    throw error;
  }

  return (data as JoinedSessionRow[]).map((item) => item.session_id);
}

export async function getMyJoinedSessions() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("session_participants")
    .select(
      `
      session_id,
      sessions (
        id,
        title,
        description,
        meeting_link,
        session_date
      )
    `
    )
    .eq("student_id", user.id);

  if (error) {
    throw error;
  }

  return data;
}

export async function getParticipantsForMentorSessions() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("session_participants")
    .select(
      `
      id,
      session_id,
      student_id,
      created_at,
      sessions!inner (
        id,
        title,
        mentor_id
      )
    `
    )
    .eq("sessions.mentor_id", user.id);

  if (error) {
    throw error;
  }

  return data;
}

export async function getProfilesByIds(userIds: string[]) {
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("id", userIds);

  if (error) {
    throw error;
  }

  return data;
}
export async function leaveSession(sessionId: string) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  const { error } = await supabase
    .from("session_participants")
    .delete()
    .eq("session_id", sessionId)
    .eq("student_id", user.id);

  if (error) {
    throw error;
  }

  return true;
}