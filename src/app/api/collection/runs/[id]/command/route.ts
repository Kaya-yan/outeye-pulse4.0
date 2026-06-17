import { NextRequest, NextResponse } from 'next/server';
import { buildRunCommand } from '@/lib/collection-run-command';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { data: run, error } = await supabase
    .from('collection_runs')
    .select('id, source, mode, target_type, target_value')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  return NextResponse.json({ command: buildRunCommand(run) });
}
