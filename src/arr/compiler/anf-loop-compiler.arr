#lang pyret

provide *
import ast as A
import sets as Sets
import "compiler/ast-anf.arr" as N
import "compiler/ast-split.arr" as S
import "compiler/js-ast.arr" as J
import "compiler/gensym.arr" as G
import "compiler/compile-structs.arr" as CS
import string-dict as D
import srcloc as SL

j-fun = J.j-fun
j-var = J.j-var
j-id = J.j-id
j-method = J.j-method
j-block = J.j-block
j-true = J.j-true
j-false = J.j-false
j-num = J.j-num
j-str = J.j-str
j-return = J.j-return
j-assign = J.j-assign
j-if = J.j-if
j-if1 = J.j-if1
j-app = J.j-app
j-list = J.j-list
j-obj = J.j-obj
j-dot = J.j-dot
j-bracket = J.j-bracket
j-field = J.j-field
j-dot-assign = J.j-dot-assign
j-bracket-assign = J.j-bracket-assign
j-try-catch = J.j-try-catch
j-throw = J.j-throw
j-expr = J.j-expr
j-binop = J.j-binop
j-eq = J.j-eq
j-neq = J.j-neq
j-unop = J.j-unop
j-decr = J.j-decr
j-incr = J.j-incr
j-not = J.j-not
j-ternary = J.j-ternary
j-null = J.j-null
j-parens = J.j-parens
j-switch = J.j-switch
j-case = J.j-case
j-default = J.j-default
j-label = J.j-label
j-break = J.j-break
j-while = J.j-while
make-label-sequence = J.make-label-sequence

get-field-loc = j-id("G")
throw-uninitialized = j-id("U")
source-name = j-id("M")
undefined = j-id("D")

data ConcatList<a>:
  | concat-empty with:
    to-list-acc(self, rest): rest end,
    map(self, f): self end,
    each(self, f): nothing end,
    foldl(self, f, base): base end,
    foldr(self, f, base): base end
  | concat-singleton(element) with:
    to-list-acc(self, rest): link(self.element, rest) end,
    map(self, f): concat-singleton(f(self.element)) end,
    each(self, f):
      f(self.element)
      nothing
    end,
    foldl(self, f, base): f(base, self.element) end,
    foldr(self, f, base): f(self.element, base) end
  | concat-append(left :: ConcatList<a>, right :: ConcatList<a>) with:
    to-list-acc(self, rest :: List):
      self.left.to-list-acc(self.right.to-list-acc(rest))
    end,
    map(self, f): concat-append(self.left.map(f), self.right.map(f)) end,
    each(self, f):
      self.left.each(f)
      self.right.each(f)
    end,
    foldl(self, f, base): self.right.foldl(f, self.left.foldl(f, base)) end,
    foldr(self, f, base): self.left.foldr(f, self.right.foldr(f, base)) end
  | concat-cons(first :: a, rest :: ConcatList<a>) with:
    to-list-acc(self, rest): link(self.first, self.rest.to-list-acc(rest)) end,
    map(self, f): concat-cons(f(self.first), self.rest.map(f)) end,
    each(self, f):
      f(self.first)
      self.rest.each(f)
    end,
    foldl(self, f, base): self.rest.foldl(f, f(base, self.first)) end,
    foldr(self, f, base): f(self.first, self.rest.foldr(f, base)) end
  | concat-snoc(head :: ConcatList<a>, last :: a) with:
    to-list-acc(self, rest): self.head.to-list-acc(link(self.last, rest)) end,
    map(self, f): concat-snoc(self.head.map(f), f(self.last)) end,
    each(self, f):
      self.head.each(f)
      f(self.last)
      nothing
    end,
    foldl(self, f, base): f(self.head.foldl(f, base), self.last) end,
    foldr(self, f, base): self.head.foldr(f, f(self.last, base)) end
sharing:
  _plus(self, other :: ConcatList):
    concat-append(self, other)
  end,
  to-list(self): self.to-list-acc([list: ]) end
where:
  ce = concat-empty
  co = concat-singleton
  ca = concat-append
  cc = concat-cons
  cs = concat-snoc
  l1 = ca(cs(cc(1, ce), 2), cc(3, cs(ce, 4)))
  l1.foldl(lam(base, e): base + tostring(e * e) end, "B") is "B14916"
  l1.foldr(lam(e, base): tostring(e * e) + base end, "B") is "14916B"
end
fun concat-foldl(f, base, lst): lst.foldl(f, base) end
fun concat-foldr(f, base, lst): lst.foldr(f, base) end

Loc = SL.Srcloc

js-id-of = block:
  var js-ids = D.string-dict()
  lam(id :: String):
    when not(is-string(id)): raise("js-id-of got non-string: " + torepr(id));
    if js-ids.has-key(id):
      js-ids.get(id)
    else:
      no-hyphens = string-replace(id, "-", "_DASH_")
      safe-id = G.make-name(no-hyphens)
      js-ids.set(id, safe-id)
      safe-id
    end
  end
end

fun compiler-name(id):
  G.make-name("$" + id)
end

fun obj-of-loc(l):
  j-list(false, [list: 
    j-id("M"),
    j-num(l.start-line),
    j-num(l.start-column),
    j-num(l.start-char),
    j-num(l.end-line),
    j-num(l.end-column),
    j-num(l.end-char)
  ])
end

fun get-field(obj, field, loc):
  j-app(get-field-loc, [list: obj, field, loc])
end

fun raise-id-exn(loc, name):
  j-app(throw-uninitialized, [list: loc, j-str(name)])
end

fun add-stack-frame(exn-id, loc):
  j-method(j-dot(j-id(exn-id), "pyretStack"), "push", [list: loc])
end

fun rt-field(name): j-dot(j-id("R"), name);
fun rt-method(name, args): j-method(j-id("R"), name, args);

fun app(l, f, args):
  j-method(f, "app", args)
end

fun check-fun(l, f):
  j-if1(j-unop(j-parens(rt-method("isFunction", [list: f])), j-not),
    j-method(rt-field("ffi"), "throwNonFunApp", [list: l, f]))
end

fun thunk-app(block):
  j-app(j-parens(j-fun([list: ], block)), [list: ])
end

fun thunk-app-stmt(stmt):
  thunk-app(j-block([list: stmt]))
end

fun helper-name(s :: String): "$H" + js-id-of(s.tostring());

fun arity-check(loc-expr, arity):
  j-if1(j-binop(j-dot(j-id("arguments"), "length"), j-neq, j-num(arity)),
    j-expr(j-method(rt-field("ffi"), "throwArityErrorC", [list: loc-expr, j-num(arity), j-id("arguments")])))
end

local-bound-vars-visitor = {
  j-field(self, name, value): value.visit(self) end,
  j-parens(self, exp): exp.visit(self) end,
  j-unop(self, exp, op): exp.visit(self) end,
  j-binop(self, left, op, right): left.visit(self).union(right.visit(self)) end,
  j-fun(self, args, body): sets.empty-tree-set end,
  j-app(self, func, args): args.foldl(lam(arg, base): base.union(arg.visit(self)) end, func.visit(self)) end,
  j-method(self, obj, meth, args): sets.empty-tree-set end,
  j-ternary(self, test, consq, alt): test.visit(self).union(consq.visit(self)).union(alt.visit(self)) end,
  j-assign(self, name, rhs): rhs.visit(self) end,
  j-bracket-assign(self, obj, field, rhs): obj.visit(self).union(field.visit(self)).union(rhs.visit(self)) end,
  j-dot-assign(self, obj, name, rhs): obj.visit(self).union(rhs.visit(self)) end,
  j-dot(self, obj, name): obj.visit(self) end,
  j-bracket(self, obj, field): obj.visit(self).union(field.visit(self)) end,
  j-list(self, multi-line, elts):
    elts.foldl(lam(arg, base): base.union(arg.visit(self)) end, sets.empty-tree-set)
  end,
  j-obj(self, fields): fields.foldl(lam(f, base): base.union(f.visit(self)) end, sets.empty-tree-set) end,
  j-id(self, id): sets.empty-tree-set end,
  j-str(self, s): sets.empty-tree-set end,
  j-num(self, n): sets.empty-tree-set end,
  j-true(self): sets.empty-tree-set end,
  j-false(self): sets.empty-tree-set end,
  j-null(self): sets.empty-tree-set end,
  j-undefined(self): sets.empty-tree-set end,
  j-label(self, label): sets.empty-tree-set end,
  j-case(self, exp, body): exp.visit(self).union(body.visit(self)) end,
  j-default(self, body): body.visit(self) end,
  j-block(self, stmts): stmts.foldl(lam(s, base): base.union(s.visit(self)) end, sets.empty-tree-set) end,
  j-var(self, name, rhs): [tree-set: name].union(rhs.visit(self)) end,
  j-if1(self, cond, consq): cond.visit(self).union(consq.visit(self)) end,
  j-if(self, cond, consq, alt): cond.visit(self).union(consq.visit(self)).union(alt.visit(self)) end,
  j-return(self, exp): exp.visit(self) end,
  j-try-catch(self, body, exn, catch): body.visit(self).union(catch.visit(self)) end,
  j-throw(self, exp): exp.visit(self) end,
  j-expr(self, exp): exp.visit(self) end,
  j-break(self): sets.empty-tree-set end,
  j-continue(self): sets.empty-tree-set end,
  j-switch(self, exp, branches):
    branches.foldl(lam(b, base): base.union(b.visit(self)) end, exp.visit(self))
  end,
  j-while(self, cond, body): cond.visit(self).union(body.visit(self)) end
}


fun goto-case(step, label):
  [list: j-expr(j-assign(step, label)), j-break]
end

fun compile-fun-body(l, step, compiler, args, arity, body) -> J.JBlock:
  helper-labels = D.string-dict()
  make-label = make-label-sequence(0)
  ret-label = make-label()
  ans = js-id-of(compiler-name("ans"))
  visited-body = body.visit(compiler.{make-label: make-label, cur-target: ret-label, cur-step: step, cur-ans: ans})
  checker =
    j-block([list:
        arity-check(compiler.get-loc(l), arity)])
  entry-label = make-label()
  switch-cases =
    concat-empty
  ^ concat-snoc(_, j-case(entry-label, visited-body.block))
  ^ concat-append(_, visited-body.new-cases)
  ^ concat-snoc(_, j-case(ret-label, j-block([list: j-return(j-id(ans))])))
  ^ concat-snoc(_, j-default(j-block([list:
          j-throw(j-binop(j-binop(j-str("No case numbered "), J.j-plus, j-id(step)), J.j-plus,
              j-str(" in " + js-id-of(compiler.cur-bind.id.tostring()))))])))
  # Initialize the case numbers, for more legible output...
  switch-cases.each(lam(c): when J.is-j-case(c): c.exp.label.get() end end) 
  vars = (for concat-foldl(base from Sets.empty-tree-set, case-expr from switch-cases):
      base.union(case-expr.visit(local-bound-vars-visitor))
    end).to-list()
  act-record = rt-method("makeActivationRecord", [list:
      compiler.get-loc(l),
      j-id(js-id-of(compiler.cur-bind.id.tostring())),
      j-id(step),
      j-id(ans),
      j-list(false, args.map(lam(a): j-id(js-id-of(tostring(a.id))) end)),
      j-list(false, vars.map(lam(v): j-id(v) end))
    ])  
  e = js-id-of(compiler-name("e"))
  first-arg = js-id-of(tostring(args.first.id))
  ar = js-id-of(compiler-name("ar"))
  j-block([list:
      j-var(step, j-num(0)),
      j-var(ans, undefined),
      j-try-catch(
        j-block([list:
            j-if(rt-method("isActivationRecord", [list: j-id(first-arg)]),
              j-block(
                [list:
                  j-expr(j-var(ar, j-id(first-arg))),
                  j-expr(j-assign(step, j-dot(j-id(ar), "step"))),
                  j-expr(j-assign(ans, j-dot(j-id(ar), "ans")))
                ] +
                for map_n(i from 0, arg from args):
                  j-expr(j-assign(js-id-of(tostring(arg.id)), j-bracket(j-dot(j-id(ar), "args"), j-num(i))))
                end +
                for map_n(i from 0, v from vars):
                  j-expr(j-assign(v, j-bracket(j-dot(j-id(ar), "vars"), j-num(i))))
                end),
              checker),
            j-while(j-true,
              j-block([list:
                  j-expr(j-app(j-id("console.log"), [list: j-str("In " + js-id-of(compiler.cur-bind.id.tostring()) + ", step "), j-id(step), j-str(", GAS = "), rt-field("GAS"), j-str(", ans = "), j-id(ans)])),
                  j-if1(j-binop(j-unop(rt-field("GAS"), j-decr), J.j-leq, j-num(0)),
                    j-block([list: j-expr(j-dot-assign(j-id("R"), "EXN_STACKHEIGHT", j-num(0))),
                        j-expr(j-app(j-id("console.log"), [list: j-str("Out of gas in " + compiler.cur-bind.id.tostring())])),
                        j-expr(j-app(j-id("console.log"), [list: j-str("GAS is "), rt-field("GAS")])),
                        j-throw(rt-method("makeCont", empty))])),
                  j-switch(j-id(step), switch-cases.to-list())]))]),
        e,
        j-block([list:
            j-if1(rt-method("isCont", [list: j-id(e)]),
              j-block([list: 
                  j-expr(j-bracket-assign(j-dot(j-id(e), "stack"),
                      j-unop(rt-field("EXN_STACKHEIGHT"), J.j-postincr), act-record))
                ])),
            j-if1(rt-method("isPyretException", [list: j-id(e)]),
              j-block([list: 
                  j-expr(add-stack-frame(e, compiler.get-loc(l)))
                ])),
            j-throw(j-id(e))]))
  ])
end

data CaseResults:
  | c-exp(exp :: J.JExpr)
  | c-field(field :: J.JField)
  | c-block(block :: J.JBlock, new-cases :: ConcatList<J.JCase>)
end

compiler-visitor = {
  a-let(self, l :: Loc, b :: N.ABind, e :: N.ALettable, body :: N.AExpr):
    compiled-e = e.visit(self.{cur-bind: b})
    compiled-body = body.visit(self)
    c-block(
      j-block(
        link(
          j-var(js-id-of(b.id.tostring()), compiled-e.exp),
          compiled-body.block.stmts
          )
        ),
        compiled-body.new-cases
      )
  end,
  a-var(self, l :: Loc, b :: N.ABind, e :: N.ALettable, body :: N.AExpr):
    compiled-body = body.visit(self)
    compiled-e = e.visit(self.{cur-bind: b})
    c-block(
      j-block(
        j-var(js-id-of(b.id.tostring()),
          j-obj([list: j-field("$var", compiled-e.exp), j-field("$name", j-str(b.id.toname()))]))
        ^ link(_, compiled-body.block.stmts)),
      compiled-body.new-cases)
  end,
  a-tail-app(self, l :: Loc, f :: N.AVal, args :: List<N.AVal>):
    ans = self.cur-ans
    step = self.cur-step
    compiled-f = f.visit(self).exp
    compiled-args = args.map(lam(a): a.visit(self).exp end)
    c-block(
      j-block([list:
          check-fun(self.get-loc(l), compiled-f),
          # Update step before the call, so that if it runs out of gas, the resumer goes to the right step
          j-expr(j-assign(step,  self.cur-target)),
          j-expr(j-assign(ans, app(self.get-loc(l), compiled-f, compiled-args))),
          j-break]),
      concat-empty)
  end,
  a-split-app(self, l :: Loc, is-var :: Boolean, f :: N.AVal, args :: List<N.AVal>, name :: String, helper-args :: List<N.AVal>):
    ans = self.cur-ans
    step = self.cur-step
    compiled-f = f.visit(self).exp
    compiled-args = args.map(lam(a): a.visit(self).exp end)
    var new-cases = concat-empty
    helper-label =
      if (self.comp-helpers.has-key(name.key())):
        self.comp-helpers.get(name.key())
      else:
        helper = self.helpers.get(name.key())
        visited-helper = helper.body.visit(self)
        if (visited-helper.block.stmts.length() == 3):
          stmts = visited-helper.block.stmts
          e1 = stmts.first
          e2 = stmts.rest.first
          e3 = stmts.rest.rest.first
          if J.is-j-expr(e1) and J.is-j-assign(e1.expr)
            and (e1.expr.name == step)
            and J.is-j-expr(e2) and J.is-j-assign(e2.expr)
            and (e2.expr.name == ans) and J.is-j-id(e2.expr.rhs)
            and (e2.expr.rhs.id == js-id-of(helper.args.first.tostring()))
            and J.is-j-break(e3):
            self.cur-target
          else:
            lbl = self.make-label()
            self.comp-helpers.set(name.key(), lbl)
            new-cases := concat-cons(
              j-case(lbl, j-block([list:
                    j-var(helper.args.first.tostring()^js-id-of, j-id(ans)),
                    visited-helper.block])),
              visited-helper.new-cases)
            lbl
          end
        else:
          lbl = self.make-label()
          self.comp-helpers.set(name.key(), lbl)
          new-cases := concat-cons(
            j-case(lbl, j-block([list:
                  j-var(helper.args.first.tostring()^js-id-of, j-id(ans)),
                  visited-helper.block])),
            visited-helper.new-cases)
          lbl
        end
      end
    c-block(
      j-block([list:
          check-fun(self.get-loc(l), compiled-f),
          # Update step before the call, so that if it runs out of gas, the resumer goes to the right step
          j-expr(j-assign(step,  helper-label)),
          j-expr(j-assign(ans, app(self.get-loc(l), compiled-f, compiled-args))),
          j-break]),
      new-cases)
  end,
  a-seq(self, l, e1, e2):
    e1-visit = e1.visit(self).exp
    e2-visit = e2.visit(self)
    if J.JStmt(e1-visit):
      c-block(
        j-block(link(e1-visit, e2-visit.block.stmts)),
        e2-visit.new-cases)
    else:
      c-block(
        j-block(link(j-expr(e1-visit), e2-visit.block.stmts)),
        e2-visit.new-cases)
    end
  end,
  a-if(self, l :: Loc, cond :: N.AVal, consq :: N.AExpr, alt :: N.AExpr):
    compiled-consq = consq.visit(self)
    compiled-alt = alt.visit(self)

    consq-label = self.make-label()
    alt-label = self.make-label()
    new-cases =
      concat-cons(j-case(consq-label, compiled-consq.block), compiled-consq.new-cases)
      + concat-cons(j-case(alt-label, compiled-alt.block), compiled-alt.new-cases)
    c-block(
      j-block([list: 
          j-if(rt-method("isPyretTrue", [list: cond.visit(self).exp]),
            j-block(goto-case(self.cur-step, consq-label)), j-block(goto-case(self.cur-step, alt-label)))
        ]),
      new-cases)
  end,
  a-lettable(self, l :: Loc, e :: N.ALettable):
    if N.is-a-lam(e) or N.is-a-method(e):
      # Functions are always recursive, because they need to resume themselves
      # so let-bind them to a temp variable
      temp = compiler-name("temp")
      new-bind = N.a-bind(l, A.s-name(l, temp), A.a-blank)
      c-block(
        j-block([list:
            j-expr(j-assign(self.cur-step, self.cur-target)),
            j-expr(j-var(js-id-of(temp), e.visit(self.{cur-bind: new-bind}).exp)),
            j-expr(j-assign(self.cur-ans, j-id(js-id-of(temp)))),
            j-break]),
        concat-empty)
    else:
      c-block(
        j-block([list:
            j-expr(j-assign(self.cur-step, self.cur-target)),
            j-expr(j-assign(self.cur-ans, e.visit(self).exp)),
            j-break]),
        concat-empty)
    end
  end,
  a-assign(self, l :: Loc, id :: String, value :: N.AVal):
    c-exp(j-dot-assign(j-id(js-id-of(id.tostring())), "$var", value.visit(self).exp))
  end,
  a-app(self, l :: Loc, f :: N.AVal, args :: List<N.AVal>):
    c-exp(app(self.get-loc(l), f.visit(self).exp, args.map(lam(a): a.visit(self).exp end)))
  end,
  a-prim-app(self, l :: Loc, f :: String, args :: List<N.AVal>):
    c-exp(rt-method(f, args.map(lam(a): a.visit(self).exp end)))
  end,
  
  a-obj(self, l :: Loc, fields :: List<N.AField>):
    c-exp(rt-method("makeObject", [list: j-obj(fields.map(lam(f): j-field(f.name, f.value.visit(self).exp) end))]))
  end,
  a-extend(self, l :: Loc, obj :: N.AVal, fields :: List<N.AField>):
    c-exp(j-method(obj.visit(self).exp, "extendWith", [list: j-obj(fields.map(lam(f): f.visit(self).field end))]))
  end,
  a-dot(self, l :: Loc, obj :: N.AVal, field :: String):
    c-exp(get-field(obj.visit(self).exp, j-str(field), self.get-loc(l)))
  end,
  a-colon(self, l :: Loc, obj :: N.AVal, field :: String):
    c-exp(rt-method("getColonField", [list: obj.visit(self).exp, j-str(field)]))
  end,
  a-lam(self, l :: Loc, args :: List<N.ABind>, body :: N.AExpr):
    new-step = js-id-of(compiler-name("step"))
    effective-args =
      if args.length() > 0: args
      else: [list: N.a-bind(l, A.s-name(l, "resumer"), A.a-blank)]
      end
    c-exp(
      rt-method("makeFunction", [list: j-fun(effective-args.map(_.id).map(_.tostring()).map(js-id-of),
            compile-fun-body(l, new-step, self, effective-args, args.length(), body))])) # NOTE: args may be empty
  end,
  a-method(self, l :: Loc, args :: List<N.ABind>, body :: N.AExpr):
    new-step = js-id-of(compiler-name("step"))
    compiled-body = compile-fun-body(l, new-step, self, args, args.length() - 1, body)
    c-exp(
      rt-method("makeMethod", [list: j-fun([list: js-id-of(args.first.id.tostring())],
            j-block([list: 
                j-return(j-fun(args.rest.map(_.id).map(_.tostring()).map(js-id-of), compiled-body))])),
          j-fun(args.map(_.id).map(_.tostring()).map(js-id-of), compiled-body)]))
  end,
  a-val(self, v :: N.AVal):
    c-exp(v.visit(self).exp)
  end,
  a-field(self, l :: Loc, name :: String, value :: N.AVal):
    c-field(j-field(name, value.visit(self).exp))
  end,
  a-array(self, l, values):
    c-exp(j-list(false, values.map(lam(v): v.visit(self).exp end)))
  end,
  a-srcloc(self, l, loc):
    c-exp(self.get-loc(loc))
  end,
  a-num(self, l :: Loc, n :: Number):
    if num-is-fixnum(n):
      c-exp(j-parens(j-num(n)))
    else:
      c-exp(rt-method("makeNumberFromString", [list: j-str(tostring(n))]))
    end
  end,
  a-str(self, l :: Loc, s :: String):
    c-exp(j-parens(j-str(s)))
  end,
  a-bool(self, l :: Loc, b :: Bool):
    c-exp(j-parens(if b: j-true else: j-false end))
  end,
  a-undefined(self, l :: Loc):
    c-exp(undefined)
  end,
  a-id(self, l :: Loc, id :: String):
    c-exp(j-id(js-id-of(id.tostring())))
  end,
  a-id-var(self, l :: Loc, id :: String):
    c-exp(j-dot(j-id(js-id-of(id.tostring())), "$var"))
  end,
  a-id-letrec(self, l :: Loc, id :: String, safe :: Boolean):
    s = id.tostring()
    if safe:
      c-exp(j-dot(j-id(js-id-of(s)), "$var"))
    else:
      c-exp(
        j-ternary(
          j-binop(j-dot(j-id(js-id-of(s)), "$var"), j-eq, undefined),
          raise-id-exn(self.get-loc(l), id.toname()),
          j-dot(j-id(js-id-of(s)), "$var")))
    end
  end,

  a-data-expr(self, l, name, variants, shared):
    fun brand-name(base):
      compiler-name("brand-" + base)
    end

    shared-fields = shared.map(lam(f): f.visit(self).field end)
    base-brand = brand-name(name)

    fun make-brand-predicate(b :: String, pred-name :: String):
      j-field(
          pred-name,
          rt-method("makeFunction", [list: 
              j-fun(
                  [list: "val"],
                  j-block([list: 
                    j-return(rt-method("makeBoolean", [list: rt-method("hasBrand", [list: j-id("val"), j-str(b)])]))
                  ])
                )
            ])
        )
    end

    fun make-variant-constructor(l2, base-id, brands-id, vname, members):
      member-names = members.map(lam(m): m.bind.id.toname();)
      j-field(
          vname,
          rt-method("makeFunction", [list: 
            j-fun(
              member-names.map(js-id-of),
              j-block(
                [list: 
                  arity-check(self.get-loc(l2), member-names.length()),
                  j-var("dict", rt-method("create", [list: j-id(base-id)]))
                ] +
                for map2(n from member-names, m from members):
                  cases(N.AMemberType) m.member-type:
                    | a-normal => j-bracket-assign(j-id("dict"), j-str(n), j-id(js-id-of(n)))
                    | a-cyclic => raise("Cannot handle cyclic fields yet")
                    | a-mutable => raise("Cannot handle mutable fields yet")
                  end
                end +
                [list: 
                  j-return(rt-method("makeBrandedObject", [list: j-id("dict"), j-id(brands-id)]))
                ]
              ))
          ])
        )
    end

    fun compile-variant(v :: N.AVariant):
      vname = v.name
      variant-base-id = js-id-of(compiler-name(vname + "-base"))
      variant-brand = brand-name(vname)
      variant-brand-obj-id = js-id-of(compiler-name(vname + "-brands"))
      variant-brands = j-obj([list: 
          j-field(base-brand, j-true),
          j-field(variant-brand, j-true)
        ])
      stmts = [list: 
        j-var(variant-base-id, j-obj(shared-fields + v.with-members.map(lam(f): f.visit(self).field end))),
        j-var(variant-brand-obj-id, variant-brands)
      ]
      predicate = make-brand-predicate(variant-brand, A.make-checker-name(vname))

      cases(N.AVariant) v:
        | a-variant(l2, constr-loc, _, members, with-members) =>
          {
            stmts: stmts,
            constructor: make-variant-constructor(constr-loc, variant-base-id, variant-brand-obj-id, vname, members),
            predicate: predicate
          }
        | a-singleton-variant(_, _, with-members) =>
          {
            stmts: stmts,
            constructor: j-field(vname, rt-method("makeBrandedObject", [list: j-id(variant-base-id), j-id(variant-brand-obj-id)])),
            predicate: predicate
          }
      end
    end

    variant-pieces = variants.map(compile-variant)

    header-stmts = for fold(acc from [list: ], piece from variant-pieces):
      piece.stmts.reverse() + acc
    end.reverse()
    obj-fields = for fold(acc from [list: ], piece from variant-pieces):
      [list: piece.constructor] + [list: piece.predicate] + acc
    end.reverse()

    data-predicate = make-brand-predicate(base-brand, name)

    data-object = rt-method("makeObject", [list: j-obj([list: data-predicate] + obj-fields)])

    c-exp(thunk-app(j-block(header-stmts + [list: j-return(data-object)])))
  end
}

remove-useless-if-visitor = N.default-map-visitor.{
  a-if(self, l, c, t, e):
    cases(N.AVal) c:
      | a-bool(_, test) =>
        if test: t.visit(self) else: e.visit(self) end
      | else => N.a-if(l, c.visit(self), t.visit(self), e.visit(self))
    end
  end
}

check:
  d = N.dummy-loc
  true1 = N.a-if(d, N.a-bool(d, true), N.a-num(d, 1), N.a-num(d, 2))
  true1.visit(remove-useless-if-visitor) is N.a-num(d, 1)

  false4 = N.a-if(d, N.a-bool(d, false), N.a-num(d, 3), N.a-num(d, 4))
  false4.visit(remove-useless-if-visitor) is N.a-num(d, 4)

  N.a-if(d, N.a-id(d, "x"), true1, false4).visit(remove-useless-if-visitor) is
    N.a-if(d, N.a-id(d, "x"), N.a-num(d, 1), N.a-num(d, 4))

end

fun mk-abbrevs(l):
  [list: 
    j-var("G", rt-field("getFieldLoc")),
    j-var("U", j-fun([list: "loc", "name"],
        j-block([list: j-method(rt-field("ffi"), "throwUninitializedIdMkLoc",
                          [list: j-id("loc"), j-id("name")])]))),
    j-var("M", j-str(l.source)),
    j-var("D", rt-field("undefined"))
  ]
end

fun compile-program(self, l, headers, split, env):
  fun inst(id): j-app(j-id(id), [list: j-id("R"), j-id("NAMESPACE")]);
  free-ids = S.freevars-split-result(split).difference(set(headers.map(_.name)))
  namespace-binds = for map(n from free-ids.to-list()):
    j-var(js-id-of(n.tostring()), j-method(j-id("NAMESPACE"), "get", [list: j-str(n.toname())]))
  end
  ids = headers.map(_.name).map(_.tostring()).map(js-id-of)
  filenames = headers.map(lam(h):
      cases(N.AHeader) h:
        | a-import-builtin(_, name, _) => "trove/" + name
        | a-import-file(_, file, _) => file
      end
    end)
  module-id = compiler-name(l.source)
  module-ref = lam(name): j-bracket(rt-field("modules"), j-str(name));
  input-ids = ids.map(lam(f): compiler-name(f) end)
  fun wrap-modules(modules, body-name, body-fun):
    mod-input-ids = modules.map(lam(f): j-id(f.input-id) end)
    mod-ids = modules.map(_.id)
    j-return(rt-method("loadModules",
        [list: j-id("NAMESPACE"), j-list(false, mod-input-ids),
          j-fun(mod-ids,
            j-block([list:
                j-var(body-name, body-fun),
                j-return(rt-method(
                    "safeCall",
                    [list: 
                      j-id(body-name),
                      j-fun([list: "moduleVal"],
                        j-block([list: 
                            j-bracket-assign(rt-field("modules"), j-str(module-id), j-id("moduleVal")),
                            j-return(j-id("moduleVal"))
                          ])),
                      j-str(body-name)
                ]))]))]))
  end
  module-specs = for map2(id from ids, in-id from input-ids):
    { id: id, input-id: in-id }
  end

  var locations = concat-empty
  var loc-count = 0
  var loc-cache = D.string-dict()
  locs = "L"
  fun get-loc(shadow l :: Loc):
    as-str = torepr(l)
    if loc-cache.has-key(as-str):
      loc-cache.get(as-str)
    else:
      ans = j-bracket(j-id(locs), j-num(loc-count))
      loc-cache.set(as-str, ans)
      loc-count := loc-count + 1
      locations := concat-snoc(locations, obj-of-loc(l))
      ans
    end
  end

  step = js-id-of(compiler-name("step"))
  toplevel-name = compiler-name("toplevel")
  resumer = N.a-bind(l, A.s-name(l, "resumer"), A.a-blank)
  visited-body = compile-fun-body(l, step, self.{get-loc: get-loc, cur-bind: N.a-bind(l, A.s-name(l, toplevel-name), A.a-blank)}, [list: resumer], 0, split.body)
  toplevel-fun = j-fun([list: js-id-of(tostring(resumer.id))], visited-body)
  define-locations = j-var(locs, j-list(true, locations.to-list()))
  j-app(j-id("define"), [list: j-list(true, filenames.map(j-str)), j-fun(input-ids, j-block([list: 
            j-return(j-fun([list: "R", "NAMESPACE"],
                j-block([list: 
                    j-if(module-ref(module-id),
                      j-block([list: j-return(module-ref(module-id))]),
                      j-block(mk-abbrevs(l) +
                        [list: define-locations] + 
                        namespace-binds +
                        [list: wrap-modules(module-specs, js-id-of(toplevel-name), toplevel-fun)]))])))]))])
end

fun splitting-compiler(env):
  compiler-visitor.{
    a-program(self, l, headers, body):
      simplified = body.visit(remove-useless-if-visitor)
      split = S.ast-split(simplified)
      helpers-dict = D.string-dict()
      for each(h from split.helpers):
        helpers-dict.set(h.name.key(), h)
      end
      compile-program(self.{helpers: helpers-dict, comp-helpers: D.string-dict()}, l, headers, split, env)
    end
  }
end

fun non-splitting-compiler(env):
  compiler-visitor.{
    a-program(self, l, headers, body):
      simplified = body.visit(remove-useless-if-visitor)
      split = S.split-result([list: ], simplified, N.freevars-e(simplified))
      compile-program(self, l, headers, split, env)
    end
  }
end

