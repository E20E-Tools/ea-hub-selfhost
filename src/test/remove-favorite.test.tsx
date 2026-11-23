import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { MY_TOOLS_KEY, readMyTools } from "@/lib/my-tools";
import { useMyTools } from "@/lib/use-my-tools";

it("repeating a favorite removal preserves other saved tools and the comparison", () => {
  const original = { favorites: ["radar", "innovation"], compare: ["radar"] };
  window.localStorage.setItem(MY_TOOLS_KEY, JSON.stringify(original));
  const { result } = renderHook(useMyTools);
  act(() => {
    result.current.removeFavorite("radar");
    result.current.removeFavorite("radar");
    result.current.removeFavorite("absent");
  });
  expect(result.current.favorites).toEqual(["innovation"]);
  expect(readMyTools(window.localStorage).value).toEqual({
    favorites: ["innovation"],
    compare: ["radar"],
  });
});
